//! HyperX wireless headsets and Pulsefire Haste 2 mice (HP VID 03F0, older Kingston VID 0951).
//! Protocols: Pulsefire Haste 2 Core Wireless verified on hardware (03F0:0AB5), see `haste_wireless`;
//! Cloud III Wireless verified on hardware (03F0:0C9D) and github.com/Medprj/HyperXWM;
//! Cloud III S from github.com/LennardKittner/HyperHeadset; Cloud Stinger Core from
//! github.com/davidsantanaalves/HyperBatteryMonitor; the others follow github.com/Sapd/HeadsetControl.

use std::sync::Mutex;

use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{clamp100, hex4, interpolate, HidColl, HidIo, PollContext};
use crate::win::{now_ms, sleep_ms};

// Writes `req` and returns the first input report accepted by `is_reply` within `timeout_ms`.
fn query(d: &mut dyn HidIo, req: &[u8], resp: &mut Vec<u8>, timeout_ms: u64, is_reply: impl Fn(&[u8]) -> bool) -> bool {
    if !d.write(req, 500) { return false; }  // the C++ Query relied on HidDev::Write's default timeout
    let end = now_ms() + timeout_ms;
    loop {
        let left = (end as i64 - now_ms() as i64) as i32;
        if left <= 0 || d.read(resp, left as u32) < 0 { return false; }
        if is_reply(resp) { return true; }
    }
}

fn base(pid: u16, name: &str) -> DeviceStatus {
    DeviceStatus {
        key: format!("hyperx:{}", hex4(pid)),
        name: name.into(),
        kind: DeviceKind::Headset,
        via: "2.4 GHz receiver".into(),
        ..Default::default()
    }
}

// Cloud III Wireless: report 66 <cmd>; 82 -> [2] connected, 8A -> [2] charging, 89 -> [2..3] mV, [4] %.
fn cloud3(ctx: &mut PollContext, c: &HidColl, s: &mut DeviceStatus) -> bool {
    let Some(mut d) = ctx.open(c) else { return false };
    fn q(d: &mut dyn HidIo, cmd: u8, r: &mut Vec<u8>) -> bool {
        query(d, &[0x66, cmd], r, 800, |r| r.len() >= 5 && r[0] == 0x66 && r[1] == cmd)
    }
    let mut r: Vec<u8> = Vec::new();
    if !q(&mut *d, 0x82, &mut r) { return false; }
    let name = if c.pid == 0x069F || c.pid == 0x0995 { "HyperX Cloud II Core Wireless" } else { "HyperX Cloud III Wireless" };
    *s = base(c.pid, name);
    s.connected = r[2] != 0;
    if s.connected {
        if q(&mut *d, 0x8A, &mut r) { s.charging = r[2] == 1; }
        if q(&mut *d, 0x89, &mut r) && r[4] <= 100 {
            s.percent = r[4] as i32;
            s.millivolts = ((r[2] as i32) << 8) | r[3] as i32;
        }
    }
    true
}

// Cloud II Wireless (HP): report 06 FF BB <cmd>; 02 -> [7] %, 03 -> [4] charging.
fn cloud2(ctx: &mut PollContext, c: &HidColl, s: &mut DeviceStatus) -> bool {
    let Some(mut d) = ctx.open(c) else { return false };
    fn q(d: &mut dyn HidIo, cmd: u8, r: &mut Vec<u8>) -> bool {
        query(d, &[0x06, 0xFF, 0xBB, cmd], r, 1000,
              |r| r.len() >= 8 && r[0] == 0x06 && r[1] == 0xFF && r[2] == 0xBB && r[3] == cmd)
    }
    let mut r: Vec<u8> = Vec::new();
    if !q(&mut *d, 0x02, &mut r) || r[7] > 100 { return false; }
    *s = base(c.pid, "HyperX Cloud II Wireless");
    s.percent = r[7] as i32;
    s.millivolts = ((r[5] as i32) << 8) | r[6] as i32;
    if q(&mut *d, 0x03, &mut r) { s.charging = r[4] == 1; }
    true
}

// Cloud II Wireless (Kingston 0951:1718): fixed 62-byte frame, reply 0B 00 BB <cmd>.
fn cloud2_kingston(ctx: &mut PollContext, c: &HidColl, s: &mut DeviceStatus) -> bool {
    let Some(mut d) = ctx.open(c) else { return false };
    fn q(d: &mut dyn HidIo, cmd: u8, r: &mut Vec<u8>) -> bool {
        let req = [0x06, 0x00, 0x02, 0x00, 0x9A, 0x00, 0x00, 0x68, 0x4A, 0x8E, 0x0A, 0x00, 0x00, 0x00, 0xBB, cmd, 0x00];
        query(d, &req, r, 1000, |r| r.len() >= 8 && r[0] == 0x0B && r[2] == 0xBB && r[3] == cmd)
    }
    let mut r: Vec<u8> = Vec::new();
    if !q(&mut *d, 0x02, &mut r) || r[7] > 100 { return false; }
    *s = base(c.pid, "HyperX Cloud II Wireless");
    s.percent = r[7] as i32;
    if q(&mut *d, 0x03, &mut r) { s.charging = r[4] == 1; }
    true
}

// Cloud Alpha Wireless: 21 BB <cmd>; 03 -> [3]==1 offline, 0C -> [3]==1 charging, 0B -> [3] %.
fn cloud_alpha(ctx: &mut PollContext, c: &HidColl, s: &mut DeviceStatus) -> bool {
    let Some(mut d) = ctx.open(c) else { return false };
    fn q(d: &mut dyn HidIo, cmd: u8, r: &mut Vec<u8>) -> bool {
        query(d, &[0x21, 0xBB, cmd], r, 1000, |r| r.len() >= 4 && r[0] == 0x21 && r[2] == cmd)
    }
    let mut r: Vec<u8> = Vec::new();
    if !q(&mut *d, 0x03, &mut r) { return false; }
    *s = base(c.pid, "HyperX Cloud Alpha Wireless");
    s.connected = r[3] != 0x01;
    if !s.connected { return true; }
    if q(&mut *d, 0x0C, &mut r) { s.charging = r[3] == 0x01; }
    if q(&mut *d, 0x0B, &mut r) && r[3] <= 100 { s.percent = r[3] as i32; }
    true
}

// Cloud Alpha 2 Wireless: [cmd][sub]; reply [cmd+1][sub]...; 52 01 -> [2] connected, 50 02 -> [2] %, [3] charging.
fn cloud_alpha2(ctx: &mut PollContext, c: &HidColl, s: &mut DeviceStatus) -> bool {
    let Some(mut d) = ctx.open(c) else { return false };
    fn q(d: &mut dyn HidIo, cmd: u8, sub: u8, r: &mut Vec<u8>) -> bool {
        query(d, &[cmd, sub], r, 1000, |r| r.len() >= 8 && r[0] == cmd + 1 && r[1] == sub)
    }
    let mut r: Vec<u8> = Vec::new();
    if !q(&mut *d, 0x52, 0x01, &mut r) { return false; }
    *s = base(c.pid, "HyperX Cloud Alpha 2 Wireless");
    s.connected = r[2] != 0;
    if s.connected && q(&mut *d, 0x50, 0x02, &mut r) && r[2] <= 100 {
        s.percent = r[2] as i32;
        s.charging = r[3] == 0x01;
        s.millivolts = (r[6] as i32) | ((r[7] as i32) << 8);
    }
    true
}

// C++ HasteWireless's function-local statics: when the mouse link was last seen up (0 = unknown), and
// whether a Haste dongle was polled before.
struct HasteLink {
    link_up_at: u64,
    polled: bool,
}
static HASTE_LINK: Mutex<HasteLink> = Mutex::new(HasteLink { link_up_at: 0, polled: false });

// Pulsefire Haste 2 (Core) Wireless: NGENUITY's read-only battery query, the same 52 01 / 50 02 pair as
// Cloud Alpha 2, on the dongle's vendor collection (interface 2). 64-byte reports.
// From github.com/PMarinov1994/ngenuity-linux-cli (Haste 2 Wireless). Verified on a Core Wireless (03F0:0AB5);
// the Haste 2 Wireless dongles (0D97, 0F98) are untested.
fn haste_wireless(ctx: &mut PollContext, c: &HidColl, s: &mut DeviceStatus) -> bool {
    let Some(mut d) = ctx.open(c) else { return false };
    fn q(d: &mut dyn HidIo, cmd: u8, sub: u8, r: &mut Vec<u8>) -> bool {
        query(d, &[cmd, sub], r, 1000, |r| r.len() >= 8 && r[0] == cmd + 1 && r[1] == sub)
    }
    let mut r: Vec<u8> = Vec::new();
    // After a reconnect the dongle floods the channel with unrelated reports (44 xx, 45 xx, FB xx) and the
    // link reply can miss the time limit, so a missing link reply is not an error: the battery query decides.
    let link_known = q(&mut *d, 0x52, 0x01, &mut r);
    let linked = !link_known || r[2] != 0;
    let got_battery = linked && q(&mut *d, 0x50, 0x02, &mut r) && r[2] <= 100;
    if !link_known && !got_battery { return false; }

    // For about 5 s after it powers on the mouse reports 40% instead of its real level (measured 2026-11-17
    // on a Core Wireless: 40% for 2-5 s, then 70%). A reading inside that settle window is not trusted. The
    // first poll after the app starts assumes the mouse has been on for a while.
    const SETTLE_MS: u64 = 6000;
    let now = now_ms();
    let mut link = HASTE_LINK.lock().unwrap();
    if !linked {
        link.link_up_at = 0;
    } else if link.link_up_at == 0 {
        link.link_up_at = if link.polled { now } else { now.wrapping_sub(SETTLE_MS) };
    }
    link.polled = true;
    let settled = now.wrapping_sub(link.link_up_at) >= SETTLE_MS;
    drop(link);

    let name = if c.pid == 0x0AB5 { "HyperX Pulsefire Haste 2 Core Wireless" } else { "HyperX Pulsefire Haste 2 Wireless" };
    *s = base(c.pid, name);
    s.kind = DeviceKind::Mouse;
    s.connected = linked;
    if got_battery && settled {  // an unsettled reading stays unknown, so the tray keeps the last value dimmed
        s.percent = r[2] as i32;
        s.charging = r[3] == 0x01 || r[3] == 0x02;
        s.millivolts = (r[6] as i32) | ((r[7] as i32) << 8);
    }
    true
}

// Cloud Flight: 21 FF 05 -> [3..4] mV (above 0x100B means charging).
fn cloud_flight(ctx: &mut PollContext, c: &HidColl, s: &mut DeviceStatus) -> bool {
    let Some(mut d) = ctx.open(c) else { return false };
    let mut r: Vec<u8> = Vec::new();
    if !query(&mut *d, &[0x21, 0xFF, 0x05], &mut r, 1000, |r| r.len() >= 5) { return false; }
    let mv = ((r[3] as i32) << 8) | r[4] as i32;
    *s = base(c.pid, "HyperX Cloud Flight");
    s.millivolts = mv;
    if mv > 0x100B {
        s.charging = true;
    } else if mv <= 3648 {
        s.percent = clamp100((0.00125 * mv as f64) as i32);
    } else if mv > 3975 {
        s.percent = 100;
    } else {
        let v = mv as f64;
        s.percent = clamp100((0.00000002547505 * v.powi(4) - 0.0003900299 * v.powi(3) +
                              2.238321 * v * v - 5706.256 * v + 5452299.0).round() as i32);
    }
    true
}

// Cloud III S Wireless: report 0C [02 03 01 00 <cmd>]; reply [5] = cmd, [6] = value (FF = invalid).
//   02 -> [6] == 2 connected, 06 -> [6] %, 48 -> [6] 0 discharging / 1 charging / 2 full.
// From github.com/LennardKittner/HyperHeadset (cloud_iii_s_wireless.rs).
fn cloud3_s(ctx: &mut PollContext, c: &HidColl, s: &mut DeviceStatus) -> bool {
    let Some(mut d) = ctx.open(c) else { return false };
    fn q(d: &mut dyn HidIo, cmd: u8, r: &mut Vec<u8>) -> bool {
        query(d, &[0x0C, 0x02, 0x03, 0x01, 0x00, cmd], r, 1000,
              |r| r.len() >= 7 && r[0] == 0x0C && r[5] == cmd && r[6] != 0xFF)
    }
    let mut r: Vec<u8> = Vec::new();
    if !q(&mut *d, 0x02, &mut r) { return false; }
    *s = base(c.pid, "HyperX Cloud III S Wireless");
    s.connected = r[6] == 2;
    if !s.connected { return true; }
    if q(&mut *d, 0x06, &mut r) && r[6] <= 100 { s.percent = r[6] as i32; }
    if q(&mut *d, 0x48, &mut r) { s.charging = r[6] == 1 || r[6] == 2; }
    true
}

// Cloud Stinger Core Wireless (+ 7.1): feature report FF on the FF00:0001 collection (MI_03 Col03).
// From github.com/davidsantanaalves/HyperBatteryMonitor (Devices/CloudStingerCoreWirelessDevice.cs, MIT);
// the PlayStation receiver 03F0:0A93 was verified on hardware there (PR #6: 52 queries, codes 03/05/06).
// SetFeature(command), wait 20 ms, GetFeature(FF):
//   connection: reply [11] == 1 means the headset is on.
//   battery:    reply [9] = 03 discharging / 05 charging / 06 full, [11..12] = battery mV (little endian).
// The PlayStation receivers (03F0:0A93, 0951:1713) can first hand back the previous report (FF 01 00 ...);
// their battery reply is FF 12 05, so on them the reply is read again (up to 10 x 20 ms) until it looks right.
// 0951:1713 (Kingston PlayStation receiver, same MI_03 layout as 0A93) was verified on hardware.
fn stinger_core(ctx: &mut PollContext, c: &HidColl, s: &mut DeviceStatus) -> bool {
    const CONNECTION: [u8; 20] = [0xFF, 0x07, 0x00, 0xFD, 0x04, 0x00, 0x00, 0x02, 0x82, 0x03,
                                  0x05, 0x29, 0x0F, 0x00, 0x00, 0x03, 0x68, 0x10, 0x00, 0x00];
    const BATTERY: [u8; 12] = [0xFF, 0x07, 0x00, 0xFD, 0x04, 0x0C, 0xF1, 0x02, 0x01, 0x04, 0xF0, 0x0C];
    // mV -> % in 10% steps, from the same source (separate curves while charging and on battery).
    const PCT: [i32; 11] = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0];
    const CHARGING_MV: [i32; 11] = [4130, 4090, 4050, 4000, 3967, 3946, 3930, 3916, 3871, 3831, 3400];
    const DISCHARGING_MV: [i32; 11] = [4121, 4042, 3954, 3905, 3838, 3785, 3763, 3738, 3700, 3651, 3517];

    let Some(mut d) = ctx.open(c) else { return false };
    let ps = c.pid == 0x0A93 || c.pid == 0x1713;
    fn exchange(d: &mut dyn HidIo, ps: bool, cmd: &[u8], r: &mut Vec<u8>, good: fn(&[u8]) -> bool) -> bool {
        if !d.set_feature(cmd) { return false; }
        let attempts = if ps { 10 } else { 1 };
        for _ in 0..attempts {
            sleep_ms(20);
            if !d.get_feature(0xFF, r) || r.len() < 13 { return false; }
            if !ps || good(r) { return true; }
        }
        false
    }
    fn fresh(r: &[u8]) -> bool { !(r[1] == 0x01 && r[2] == 0x00) }
    fn battery(r: &[u8]) -> bool { r[0] == 0xFF && r[1] == 0x12 && r[2] == 0x05 }

    let mut r: Vec<u8> = Vec::new();
    // The connection reply's header isn't documented, so after 10 stale-looking reads the last one is used.
    if !exchange(&mut *d, ps, &CONNECTION, &mut r, fresh) && !(ps && r.len() >= 13 && !fresh(&r)) { return false; }
    *s = base(c.pid, "HyperX Cloud Stinger Core Wireless");
    s.connected = r[11] == 0x01;
    if !s.connected || !exchange(&mut *d, ps, &BATTERY, &mut r, battery) { return true; }
    let code = r[9];
    if code != 0x03 && code != 0x05 && code != 0x06 { return true; }
    s.millivolts = (r[11] as i32) | ((r[12] as i32) << 8);
    s.charging = code == 0x05;
    s.percent = if code == 0x06 {
        100
    } else {
        interpolate(s.millivolts, if code == 0x05 { &CHARGING_MV } else { &DISCHARGING_MV }, &PCT)
    };
    true
}

struct Model {
    vid: u16,
    pids: &'static [u16],
    accept: fn(&HidColl) -> bool,  // which collection carries the protocol
    poll: for<'io> fn(&mut PollContext<'io>, &HidColl, &mut DeviceStatus) -> bool,
}

// The kModels table's lambdas, as named functions.
fn accept_len_62_62(c: &HidColl) -> bool { c.out_len() == 62 && c.in_len() == 62 }
fn accept_vendor_len_62_62(c: &HidColl) -> bool { c.page() >= 0xFF00 && c.out_len() >= 62 && c.in_len() >= 62 }
fn accept_len_64_64(c: &HidColl) -> bool { c.out_len() == 64 && c.in_len() == 64 }
fn accept_ff90_0303(c: &HidColl) -> bool { c.page() == 0xFF90 && c.usage() == 0x0303 }
fn accept_out_62(c: &HidColl) -> bool { c.out_len() == 62 }
fn accept_vendor_out_3(c: &HidColl) -> bool { c.page() >= 0xFF00 && c.out_len() >= 3 }
fn accept_ff13_ff00(c: &HidColl) -> bool { c.page() == 0xFF13 && c.usage() == 0xFF00 }
fn accept_vendor_out_2_in_8(c: &HidColl) -> bool { c.page() >= 0xFF00 && c.out_len() >= 2 && c.in_len() >= 8 }
fn accept_ff00_0001_feat_32(c: &HidColl) -> bool { c.page() == 0xFF00 && c.usage() == 0x0001 && c.feat_len() >= 32 }

const MODELS: &[Model] = &[
    Model { vid: 0x03F0, pids: &[0x05B7, 0x0C9D], accept: accept_len_62_62, poll: cloud3 },
    // Cloud II Core Wireless: same 66 <cmd> protocol as Cloud III Wireless, 64-byte reports (HyperHeadset).
    Model { vid: 0x03F0, pids: &[0x069F, 0x0995], accept: accept_vendor_len_62_62, poll: cloud3 },
    // Cloud III S: report 0C lives on the 64/64-byte collection, which Windows lists under usage page 01C0
    // (not a vendor page). The FF13 (62-byte) and FFC0 (32-byte) collections don't carry it.
    Model { vid: 0x03F0, pids: &[0x06BE, 0x02CC], accept: accept_len_64_64, poll: cloud3_s },
    Model { vid: 0x03F0, pids: &[0x0696, 0x018B, 0x0D93], accept: accept_ff90_0303, poll: cloud2 },
    Model { vid: 0x0951, pids: &[0x1718], accept: accept_out_62, poll: cloud2_kingston },
    Model { vid: 0x03F0, pids: &[0x098D], accept: accept_vendor_out_3, poll: cloud_alpha },
    Model { vid: 0x03F0, pids: &[0x08BE], accept: accept_ff13_ff00, poll: cloud_alpha2 },
    // Pulsefire Haste 2 Wireless (0D97, 0F98) and Haste 2 Core Wireless (0AB5) dongles.
    Model { vid: 0x03F0, pids: &[0x0AB5, 0x0D97, 0x0F98], accept: accept_vendor_out_2_in_8, poll: haste_wireless },
    Model { vid: 0x0951, pids: &[0x16C4, 0x1723, 0x1749], accept: accept_vendor_out_3, poll: cloud_flight },
    Model { vid: 0x03F0, pids: &[0x0E90], accept: accept_vendor_out_3, poll: cloud_flight },  // Cloud Flight (HP)
    // Cloud Stinger Core Wireless: PlayStation receivers (HP 0A93, Kingston 1713) and the original Kingston receiver.
    Model { vid: 0x03F0, pids: &[0x0A93], accept: accept_ff00_0001_feat_32, poll: stinger_core },
    Model { vid: 0x0951, pids: &[0x170B, 0x1713], accept: accept_ff00_0001_feat_32, poll: stinger_core },
];

pub fn poll_hyperx(ctx: &mut PollContext) {
    for m in MODELS {
        for &pid in m.pids {
            if ctx.is_claimed(m.vid, pid) { continue; }
            for c in ctx.find(m.vid, pid, m.accept) {
                let mut s = DeviceStatus::default();
                if (m.poll)(ctx, &c, &mut s) {
                    ctx.add(s, m.vid, pid);
                    break;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hid::mock::{test_ctx, MockFactory};
    use crate::hid::HidCaps;
    use std::collections::{BTreeSet, HashMap};

    fn collection(pid: u16, page: u16, in_len: u16, out_len: u16) -> HidColl {
        HidColl {
            path: "hyperx".into(),
            vid: 0x03F0,
            pid,
            iface: -1,
            caps: HidCaps {
                usage_page: page,
                usage: 0x0001,
                input_report_byte_length: in_len,
                output_report_byte_length: out_len,
                feature_report_byte_length: 0,
            },
            ..Default::default()
        }
    }

    /// A 64-byte input report as read() hands it to the driver.
    fn report(id: u8, sub: u8, bytes: &[(usize, u8)]) -> Vec<u8> {
        let mut r = vec![0u8; 64];
        r[0] = id;
        r[1] = sub;
        for &(i, v) in bytes { r[i] = v; }
        r
    }

    fn link(linked: u8) -> Vec<u8> { report(0x53, 0x01, &[(2, linked)]) }
    fn battery(percent: u8, charge: u8) -> Vec<u8> { report(0x51, 0x02, &[(2, percent), (3, charge)]) }

    // Reports the dongle sends on its own after a reconnect; the driver must skip them.
    fn noise1() -> Vec<u8> { report(0x44, 0x01, &[]) }
    fn noise2() -> Vec<u8> { report(0x45, 0x02, &[]) }
    fn noise3() -> Vec<u8> { report(0xFB, 0x01, &[(2, 1)]) }

    fn ask_link() -> Vec<u8> { vec![0x52, 0x01] }
    fn ask_battery() -> Vec<u8> { vec![0x50, 0x02] }

    /// The scripted dongle: reports queued when a request (command, sub) is written.
    type Script = HashMap<(u8, u8), Vec<Vec<u8>>>;

    fn dongle(link_reply: Vec<u8>, battery_reply: Vec<u8>) -> Script {
        HashMap::from([
            ((0x52, 0x01), vec![noise1(), noise2(), link_reply]),
            ((0x50, 0x02), vec![noise3(), battery_reply]),
        ])
    }

    struct PollResult {
        out: Vec<DeviceStatus>,
        claimed: BTreeSet<(u16, u16)>,
        writes: Vec<Vec<u8>>,
        opens: u32,
    }

    /// One C++ `Poll(c, replies)`: a fresh scripted dongle over a single collection.
    fn poll(c: &HidColl, script: Script) -> PollResult {
        let mut io = MockFactory::new().with_script(script);
        let mut ctx = test_ctx(c.clone(), &mut io);
        poll_hyperx(&mut ctx);
        let out = std::mem::take(&mut ctx.out);
        let claimed = std::mem::take(&mut ctx.claimed);
        PollResult { out, claimed, writes: io.writes(), opens: io.opens() }
    }

    // tests/hyperx_haste_driver_test.cpp
    #[test]
    fn hyperx_pulsefire_haste_2_wireless() {
        let core = collection(0x0AB5, 0xFF00, 64, 64);

        // Link up and a battery reply: level, name, kind and claim. Unrelated reports before the
        // replies are skipped.
        let r = poll(&core, dongle(link(1), battery(70, 0)));
        assert_eq!(r.writes, vec![ask_link(), ask_battery()]);
        assert_eq!(r.out.len(), 1);
        assert_eq!(r.out[0].key, "hyperx:0AB5");
        assert_eq!(r.out[0].name, "HyperX Pulsefire Haste 2 Core Wireless");
        assert_eq!(r.out[0].kind, DeviceKind::Mouse);
        assert_eq!(r.out[0].via, "2.4 GHz receiver");
        assert!(r.out[0].connected);
        assert_eq!(r.out[0].percent, 70);
        assert!(!r.out[0].charging);
        assert!(r.claimed.contains(&(0x03F0, 0x0AB5)));

        // Charge status 1 (charging) and 2 (full, still on the charger) both count as charging;
        // 0 and 3 do not.
        let r = poll(&core, dongle(link(1), battery(55, 1)));
        assert_eq!(r.out.len(), 1);
        assert_eq!(r.out[0].percent, 55);
        assert!(r.out[0].charging);
        let r = poll(&core, dongle(link(1), battery(100, 2)));
        assert_eq!(r.out.len(), 1);
        assert_eq!(r.out[0].percent, 100);
        assert!(r.out[0].charging);
        let r = poll(&core, dongle(link(1), battery(40, 3)));
        assert_eq!(r.out.len(), 1);
        assert_eq!(r.out[0].percent, 40);
        assert!(!r.out[0].charging);

        // Voltage bytes 6/7 are read when the mouse sends them (little endian); the Core sends zero.
        let r = poll(&core, dongle(link(1), report(0x51, 0x02, &[(2, 80), (6, 0xA4), (7, 0x0F)])));
        assert_eq!(r.out.len(), 1);
        assert_eq!(r.out[0].millivolts, 0x0FA4);

        // After a reconnect the link reply can be missing: the battery reply decides.
        let r = poll(&core, HashMap::from([((0x50u8, 0x02u8), vec![noise1(), noise3(), battery(70, 0)])]));
        assert_eq!(r.writes, vec![ask_link(), ask_battery()]);
        assert_eq!(r.out.len(), 1);
        assert!(r.out[0].connected);
        assert_eq!(r.out[0].percent, 70);

        // A battery level above 100 is not a level: the mouse is listed with an unknown level.
        let r = poll(&core, dongle(link(1), battery(101, 0)));
        assert_eq!(r.out.len(), 1);
        assert!(r.out[0].connected);
        assert!(r.out[0].percent < 0);

        // The other Haste 2 Wireless dongles use the same protocol and their own name.
        let r = poll(&collection(0x0D97, 0xFF00, 64, 64), dongle(link(1), battery(33, 0)));
        assert_eq!(r.out.len(), 1);
        assert_eq!(r.out[0].name, "HyperX Pulsefire Haste 2 Wireless");
        assert_eq!(r.out[0].percent, 33);
        let r = poll(&collection(0x0F98, 0xFF00, 64, 64), dongle(link(1), battery(34, 0)));
        assert_eq!(r.out.len(), 1);
        assert_eq!(r.out[0].key, "hyperx:0F98");
        assert_eq!(r.out[0].percent, 34);

        // No reply at all (dongle without a mouse): nothing listed, nothing claimed.
        let r = poll(&core, HashMap::new());
        assert!(r.out.is_empty());
        assert!(r.claimed.is_empty());
        assert_eq!(r.writes, vec![ask_link(), ask_battery()]);

        // Collections that are not vendor-page, or have short reports, are never opened.
        for c in [collection(0x0AB5, 0x0001, 64, 64),
                  collection(0x0AB5, 0xFF00, 4, 64),
                  collection(0x0AB5, 0xFF00, 64, 1)] {
            let r = poll(&c, dongle(link(1), battery(70, 0)));
            assert!(r.out.is_empty());
            assert!(r.writes.is_empty());
            assert_eq!(r.opens, 0);
        }

        // A claimed product is skipped.
        {
            let mut io = MockFactory::new().with_script(dongle(link(1), battery(70, 0)));
            let mut ctx = test_ctx(core.clone(), &mut io);
            ctx.claim(0x03F0, 0x0AB5);
            poll_hyperx(&mut ctx);
            assert!(ctx.out.is_empty());
            assert_eq!(io.opens(), 0);
        }

        // Link down: the mouse is listed as not connected with an unknown level, and no battery
        // query is sent.
        let r = poll(&core, dongle(link(0), battery(70, 0)));
        assert_eq!(r.writes, vec![ask_link()]);
        assert_eq!(r.out.len(), 1);
        assert!(!r.out[0].connected);
        assert!(r.out[0].percent < 0);
        assert!(r.claimed.contains(&(0x03F0, 0x0AB5)));

        // Link up again right after: the mouse reports about 40% for a few seconds after power-on,
        // so a reading less than 6 s after the link came up stays unknown and the tray keeps the
        // last value.
        let r = poll(&core, dongle(link(1), battery(40, 0)));
        assert_eq!(r.out.len(), 1);
        assert!(r.out[0].connected);
        assert!(r.out[0].percent < 0);
    }
}
