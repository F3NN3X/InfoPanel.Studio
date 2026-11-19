//! SteelSeries wireless headsets and mice (VID 1038).
//! Headset protocols follow github.com/Sapd/HeadsetControl, mouse protocols github.com/flozz/rivalcfg.

use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{clamp100, hex4, map_to_100, HidColl, HidIo, PollContext};
use crate::win::now_ms;

fn write_read(d: &mut dyn HidIo, req: &[u8], resp: &mut Vec<u8>, timeout_ms: u32) -> bool {
    d.flush();
    d.write(req, 500) && d.read(resp, timeout_ms) > 0
}

fn headset(pid: u16, name: &str) -> DeviceStatus {
    DeviceStatus {
        key: format!("steelseries:{}", hex4(pid)),
        name: name.into(),
        kind: DeviceKind::Headset,
        via: "2.4 GHz receiver".into(),
        ..Default::default()
    }
}

// ---- headsets ----------------------------------------------------------------------------------

// Arctis 1 / 1 Xbox / 7X: 06 12 -> [2]==01 offline, [3] %.
fn arctis1(d: &mut dyn HidIo, pid: u16, s: &mut DeviceStatus) -> bool {
    let mut r = Vec::new();
    if !write_read(d, &[0x06, 0x12], &mut r, 1000) || r.len() < 4 { return false; }
    *s = headset(pid, "SteelSeries Arctis 1 Wireless");
    s.connected = r[2] != 0x01;
    if s.connected { s.percent = clamp100(r[3] as i32); }
    true
}

// Arctis 7 / 7 2019 / Pro 2019: 06 18 -> [2] %.
fn arctis7(d: &mut dyn HidIo, pid: u16, s: &mut DeviceStatus) -> bool {
    let mut r = Vec::new();
    if !write_read(d, &[0x06, 0x18], &mut r, 1000) || r.len() < 3 { return false; }
    *s = headset(pid, if pid == 0x1252 { "SteelSeries Arctis Pro" } else { "SteelSeries Arctis 7" });
    s.percent = clamp100(r[2] as i32);
    s.connected = r[2] != 0;
    true
}

// Arctis 9: 00 20 -> [3] raw (0x64..0x9A), [4]==01 charging.
fn arctis9(d: &mut dyn HidIo, pid: u16, s: &mut DeviceStatus) -> bool {
    let mut r = Vec::new();
    if !write_read(d, &[0x00, 0x20], &mut r, 1000) || r.len() < 5 { return false; }
    *s = headset(pid, "SteelSeries Arctis 9");
    s.percent = map_to_100(r[3] as i32, 0x64, 0x9A);
    s.charging = r[4] == 0x01;
    true
}

// Arctis Pro Wireless: 41 AA -> [0]==02 offline (04 online); 40 AA -> [0] level 0..4.
// HeadsetControl writes 41 AA through hidapi, which treats the first byte as a report ID. That only
// reaches the base station on Linux; interface 0 does not number its reports (33-byte output report
// = ID 0 + 32 bytes), so on Windows the command has to go behind a 0 report ID or it never arrives.
fn arctis_pro_cmd(d: &mut dyn HidIo, cmd: u8, r: &mut Vec<u8>) -> bool {
    if write_read(d, &[0x00, cmd, 0xAA], r, 1000) && !r.is_empty() { return true; }
    write_read(d, &[cmd, 0xAA], r, 1000) && !r.is_empty()  // in case a firmware numbers its reports
}

fn arctis_pro_wireless(d: &mut dyn HidIo, pid: u16, s: &mut DeviceStatus) -> bool {
    let mut r = Vec::new();
    if !arctis_pro_cmd(d, 0x41, &mut r) { return false; }
    *s = headset(pid, "SteelSeries Arctis Pro Wireless");
    s.connected = r[0] != 0x02;
    if s.connected && arctis_pro_cmd(d, 0x40, &mut r) && r[0] <= 4 { s.percent = map_to_100(r[0] as i32, 0, 4); }
    true
}

// Arctis Nova Pro Wireless: 06 B0 -> [15] status (01 offline, 02 charging), [6] level 0..8.
fn nova_pro_wireless(d: &mut dyn HidIo, pid: u16, s: &mut DeviceStatus) -> bool {
    let mut r = Vec::new();
    if !write_read(d, &[0x06, 0xB0], &mut r, 1000) || r.len() < 16 { return false; }
    *s = headset(pid, "SteelSeries Arctis Nova Pro Wireless");
    s.connected = r[15] != 0x01;
    s.charging = r[15] == 0x02;
    if s.connected { s.percent = map_to_100(r[6] as i32, 0, 8); }
    true
}

// Nova family: 00 B0 -> status block; layout depends on the model.
fn nova_family(d: &mut dyn HidIo, pid: u16, s: &mut DeviceStatus) -> bool {
    let mut r = Vec::new();
    if !write_read(d, &[0x00, 0xB0], &mut r, 1000) || r.len() < 7 { return false; }
    if [0x220E, 0x2212, 0x2216, 0x2236].contains(&pid) {  // Arctis 7+
        *s = headset(pid, "SteelSeries Arctis 7+");
        s.connected = r[1] != 0x01;
        s.percent = map_to_100(r[2] as i32, 0, 4);
        s.charging = r[3] == 0x01;
    } else if [0x2269, 0x226D, 0x2232, 0x2253].contains(&pid) {  // Nova 3P Wireless, Nova 5
        *s = headset(pid, if [0x2232, 0x2253].contains(&pid) { "SteelSeries Arctis Nova 5" }
                        else { "SteelSeries Arctis Nova 3P Wireless" });
        s.connected = r[1] != 0x02;
        s.percent = clamp100(r[3] as i32);
        s.charging = r[4] == 0x01;
    } else if pid == 0x230A {  // Arctis GameBuds: lowest of the buds that are out of the case
        *s = headset(pid, "SteelSeries Arctis GameBuds");
        let mut lvl: i32 = -1;
        if r[3] == 0x03 { lvl = r[5] as i32; }
        if r[4] == 0x03 { lvl = if lvl < 0 { r[6] as i32 } else { lvl.min(r[6] as i32) }; }
        s.connected = lvl >= 0;
        s.percent = if lvl >= 0 { clamp100(lvl) } else { -1 };
    } else {  // Arctis Nova 7 / 7X / 7P and variants
        let discrete = [0x2202, 0x2206, 0x220A, 0x223A, 0x227A, 0x22A4].contains(&pid);
        *s = headset(pid, "SteelSeries Arctis Nova 7");
        s.connected = r[3] != 0x00;
        s.charging = r[3] == 0x01 || r[3] == 0x02;
        s.percent = if discrete { map_to_100(r[2] as i32, 0, 4) } else { clamp100(r[2] as i32) };
    }
    if !s.connected { s.percent = -1; }
    true
}

// ---- mice --------------------------------------------------------------------------------------

fn mouse(pid: u16, name: &str, wired: bool) -> DeviceStatus {
    DeviceStatus {
        key: format!("steelseries:{}", hex4(pid)),
        name: name.into(),
        kind: DeviceKind::Mouse,
        via: if wired { "USB cable" } else { "2.4 GHz receiver" }.into(),
        ..Default::default()
    }
}

// Aerox 3/5/9 Wireless, Prime Wireless: 92 (wired) / D2 (wireless) -> [1] = (level/5 + 1) | charging<<7.
fn aerox(d: &mut dyn HidIo, pid: u16, s: &mut DeviceStatus) -> bool {
    let wired = [0x183A, 0x1854, 0x185A, 0x1842].contains(&pid);
    let mut r = Vec::new();
    if !write_read(d, &[0x00, if wired { 0x92 } else { 0xD2 }], &mut r, 300) || r.len() < 2 { return false; }
    let name = if [0x1838, 0x183A].contains(&pid) { "SteelSeries Aerox 3 Wireless" }
        else if [0x1852, 0x1854].contains(&pid) { "SteelSeries Aerox 5 Wireless" }
        else if [0x1858, 0x185A].contains(&pid) { "SteelSeries Aerox 9 Wireless" }
        else { "SteelSeries Prime Wireless" };
    *s = mouse(pid, name, wired);
    let raw = (r[1] & 0x7F) as i32;
    if raw == 0 { s.connected = false; }  // mouse off / out of range
    else if raw <= 21 {  // only levels 1..21 represent 0..100%; invalid levels stay unknown
        s.percent = (raw - 1) * 5;
        s.charging = (r[1] & 0x80) != 0;
    }
    true
}

// Rival 3 Wireless (+ Gen 2), Rival 650: AA 01 -> [0] %, [2] charging.
fn rival(d: &mut dyn HidIo, pid: u16, s: &mut DeviceStatus) -> bool {
    let mut r = Vec::new();
    if !write_read(d, &[0x00, 0xAA, 0x01], &mut r, 300) || r.len() < 3 { return false; }
    let rival650 = pid == 0x172B || pid == 0x1726;
    *s = mouse(pid,
        if rival650 { "SteelSeries Rival 650 Wireless" }
        else if pid == 0x1872 { "SteelSeries Rival 3 Wireless Gen 2" }
        else { "SteelSeries Rival 3 Wireless" },
        pid == 0x172B);
    if rival650 { s.key = "steelseries:172B".into(); }  // one entry whether it answers on the cable or the receiver
    s.percent = clamp100(r[0] as i32);
    s.charging = r[2] != 0;
    true
}

// Rival Pro (UWB, hot-swappable batteries): 92 -> 92 00 <mouse %> <flag> <spare battery %>.
// From the Rival Pro support pull request on rivalcfg (github.com/flozz/rivalcfg/pull/294).
fn rival_pro(d: &mut dyn HidIo, pid: u16, s: &mut DeviceStatus) -> bool {
    d.flush();
    if !d.write(&[0x00, 0x92], 500) { return false; }
    let mut r = Vec::new();
    let end = now_ms() + 500;
    loop {
        let left = (end as i64 - now_ms() as i64) as i32;
        if left <= 0 || d.read(&mut r, left as u32) < 3 { return false; }
        if r[0] == 0x92 && r[1] == 0x00 { break; }
    }
    if r[2] > 100 { return false; }
    *s = mouse(pid, "SteelSeries Rival Pro", false);
    s.via = "UWB base station".into();
    s.percent = r[2] as i32;
    true
}

struct Model {
    pids: &'static [u16],
    accept: fn(&HidColl) -> bool,
    poll: fn(&mut dyn HidIo, u16, &mut DeviceStatus) -> bool,
}

fn page_ff43(c: &HidColl) -> bool { c.page() == 0xFF43 && c.usage() == 0x0202 }
fn page_ffc0(c: &HidColl) -> bool { c.page() == 0xFFC0 && c.usage() == 0x0001 }
fn iface0(c: &HidColl) -> bool { c.iface == 0 && c.out_len() > 0 }
fn iface2(c: &HidColl) -> bool { c.iface == 2 && c.out_len() > 0 }
fn iface3(c: &HidColl) -> bool { c.iface == 3 && c.out_len() > 0 }
fn iface4(c: &HidColl) -> bool { c.iface == 4 && c.out_len() > 0 }

static K_MODELS: [Model; 10] = [
    Model { pids: &[0x12B3, 0x12B6, 0x12D7], accept: page_ff43, poll: arctis1 },
    Model { pids: &[0x1260, 0x12AD, 0x1252], accept: page_ff43, poll: arctis7 },
    Model { pids: &[0x12C2], accept: iface0, poll: arctis9 },
    Model { pids: &[0x1290], accept: iface0, poll: arctis_pro_wireless },
    Model { pids: &[0x12E0, 0x225D], accept: iface4, poll: nova_pro_wireless },
    Model { pids: &[0x220E, 0x2212, 0x2216, 0x2236, 0x2269, 0x226D, 0x2232, 0x2253, 0x230A, 0x2202, 0x22A1, 0x227E, 0x2206, 0x2258, 0x229E,
        0x22AD, 0x223A, 0x22A9, 0x227A, 0x22A4, 0x22A5, 0x220A, 0x22A7], accept: page_ffc0, poll: nova_family },
    Model { pids: &[0x1838, 0x183A, 0x1852, 0x1854, 0x1858, 0x185A, 0x1840, 0x1842], accept: iface3, poll: aerox },
    Model { pids: &[0x1830, 0x1872], accept: iface3, poll: rival },
    Model { pids: &[0x172B, 0x1726], accept: iface0, poll: rival },  // Rival 650: cable, 2.4 GHz receiver
    Model { pids: &[0x1880], accept: iface2, poll: rival_pro },
];

pub fn poll_steelseries(ctx: &mut PollContext) {
    for &(vid, pid) in &ctx.products(0x1038) {
        for m in &K_MODELS {
            if !m.pids.contains(&pid) { continue; }
            for c in ctx.find(vid, pid, m.accept) {
                let Some(mut d) = ctx.open(&c) else { continue };
                let mut s = DeviceStatus::default();
                if !(m.poll)(d.as_mut(), pid, &mut s) { continue; }
                // A Rival 650 charging on its cable can answer on both products; keep the cable's reading.
                if let Some(i) = ctx.out.iter().position(|o| o.key == s.key) {
                    if s.via == "USB cable" { ctx.out[i] = s; }
                    ctx.claim(vid, pid);
                } else {
                    ctx.add(s, vid, pid);
                }
                break;
            }
            break;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hid::mock::{test_ctx, MockFactory};
    use crate::hid::{HidCaps, HidFactory};
    use std::cell::RefCell;
    use std::rc::Rc;

    fn mouse_collection(pid: u16) -> HidColl {
        HidColl {
            vid: 0x1038,
            pid,
            iface: 3,
            caps: HidCaps {
                usage_page: 0xFFC0,
                usage: 0x0001,
                input_report_byte_length: 65,
                output_report_byte_length: 65,
                feature_report_byte_length: 0,
            },
            ..Default::default()
        }
    }

    fn headset_collection(pid: u16) -> HidColl {
        HidColl {
            vid: 0x1038,
            pid,
            iface: 4,
            caps: HidCaps {
                usage_page: 0xFFC0,
                usage: 0x0001,
                input_report_byte_length: 64,
                output_report_byte_length: 64,
                feature_report_byte_length: 1024,
            },
            ..Default::default()
        }
    }

    // tests/steelseries_mouse_test.cpp: eight models x twelve samples. The C++ mock echoed the
    // expected command byte in the reply, so the payload keeps that echo and every write is asserted
    // to be exactly { 0x00, cmd }.
    #[test]
    fn steelseries_aerox_prime_mice_levels_and_bounds() {
        const MODELS: [(u16, bool); 8] = [
            (0x1838, false), (0x183A, true), (0x1852, false), (0x1854, true),
            (0x1858, false), (0x185A, true), (0x1840, false), (0x1842, true),
        ];
        // (reply[1], percent, charging, connected)
        const SAMPLES: [(u8, i32, bool, bool); 12] = [
            (0x01, 0, false, true), (0x13, 90, false, true), (0x15, 100, false, true),
            (0x81, 0, true, true), (0x93, 90, true, true), (0x95, 100, true, true),
            // Out-of-range levels must stay unknown and never invent a charging state.
            (0xFF, -1, false, true), (0x7F, -1, false, true),
            (0x16, -1, false, true), (0x96, -1, false, true),
            // Zero is the existing off / out-of-range indication, even with the charging bit set.
            (0x00, -1, false, false), (0x80, -1, false, false),
        ];

        for &(pid, wired) in MODELS.iter() {
            let command: u8 = if wired { 0x92 } else { 0xD2 };
            for &(answer, percent, charging, connected) in SAMPLES.iter() {
                let mut io = MockFactory::new()
                    .with_expected_writes(vec![vec![0x00, command]])
                    .with_reads(vec![vec![command, answer]]);
                let mut ctx = test_ctx(mouse_collection(pid), &mut io);
                poll_steelseries(&mut ctx);
                assert_eq!(ctx.out.len(), 1, "PID {pid:04X} reply {answer:02X}");
                assert!(ctx.is_claimed(0x1038, pid), "PID {pid:04X} reply {answer:02X}");
                let status = &ctx.out[0];
                assert!(
                    status.percent == percent && status.charging == charging
                        && status.connected == connected,
                    "PID {pid:04X} reply {answer:02X}: got percent={} charging={} connected={}; \
                     expected {percent} {charging} {connected}",
                    status.percent, status.charging, status.connected,
                );
                assert_eq!(status.kind, DeviceKind::Mouse, "PID {pid:04X} reply {answer:02X}");
                assert_eq!(
                    status.via,
                    if wired { "USB cable" } else { "2.4 GHz receiver" },
                    "PID {pid:04X} reply {answer:02X}",
                );
            }
        }

        // Write failure: nothing listed.
        let mut io = MockFactory::new()
            .with_expected_writes(vec![vec![0x00, 0xD2]])
            .with_reads(vec![vec![0xD2, 0x13]])
            .with_write_ok(false);
        let mut ctx = test_ctx(mouse_collection(0x1838), &mut io);
        poll_steelseries(&mut ctx);
        assert!(ctx.out.is_empty());

        // Truncated replies (0 and 1 byte) are rejected without claiming.
        for answer in [Vec::new(), vec![0xD2]] {
            let mut io = MockFactory::new()
                .with_expected_writes(vec![vec![0x00, 0xD2]])
                .with_reads(vec![answer.clone()]);
            let mut ctx = test_ctx(mouse_collection(0x1838), &mut io);
            poll_steelseries(&mut ctx);
            assert!(ctx.out.is_empty(), "a {}-byte reply was accepted", answer.len());
            assert!(ctx.claimed.is_empty());
        }
    }

    // tests/steelseries_driver_test.cpp: the Arctis Nova Pro paths of the same driver. The C++ mock
    // counted opens/writes/reads and rejected the 06 B0 report ID on a FF00 collection ("The 225D
    // base station rejects this report ID on its FF00 collection"), so this test provides its own
    // transport the same way, instead of the shared MockFactory.
    #[derive(Default)]
    struct NovaState {
        opens: u32,
        writes: u32,
        reads: u32,
        open_ok: bool,
        write_ok: bool,
        reply: Vec<u8>,
    }

    struct NovaDev {
        sh: Rc<RefCell<NovaState>>,
        coll: HidColl,
    }

    impl HidIo for NovaDev {
        fn write(&mut self, request: &[u8], timeout_ms: u32) -> bool {
            assert_eq!(request, &[0x06u8, 0xB0], "unexpected request");
            assert!(timeout_ms > 0 && timeout_ms <= 500, "write timeout {timeout_ms}");
            let mut sh = self.sh.borrow_mut();
            sh.writes += 1;
            // The 225D base station rejects this report ID on its FF00 collection.
            sh.write_ok && self.coll.page() == 0xFFC0
        }
        fn read(&mut self, out: &mut Vec<u8>, timeout_ms: u32) -> i32 {
            assert!(timeout_ms > 0 && timeout_ms <= 1000, "read timeout {timeout_ms}");
            let mut sh = self.sh.borrow_mut();
            sh.reads += 1;
            out.clear();
            out.extend_from_slice(&sh.reply);
            if out.is_empty() { -1 } else { out.len() as i32 }
        }
        fn set_output_and_read(&mut self, _data: &[u8], _buf: &mut Vec<u8>, _timeout_ms: u32) -> i32 { -1 }
        fn flush(&mut self) {}
        fn set_feature(&mut self, _data: &[u8]) -> bool { false }
        fn get_feature(&mut self, _id: u8, _out: &mut Vec<u8>) -> bool { false }
        fn get_input_report(&mut self, _id: u8, _out: &mut Vec<u8>) -> bool { false }
    }

    struct NovaFactory {
        sh: Rc<RefCell<NovaState>>,
    }

    impl HidFactory for NovaFactory {
        fn open(&mut self, coll: &HidColl) -> Option<Box<dyn HidIo>> {
            let mut sh = self.sh.borrow_mut();
            sh.opens += 1;
            if !sh.open_ok { return None; }
            drop(sh);
            Some(Box::new(NovaDev { sh: self.sh.clone(), coll: coll.clone() }))
        }
        fn open_read_only(&mut self, coll: &HidColl) -> Option<Box<dyn HidIo>> { self.open(coll) }
        fn open_feature_only(&mut self, coll: &HidColl) -> Option<Box<dyn HidIo>> { self.open(coll) }
    }

    /// C++ `Context(pid)`: fresh counters/flags and the standard 64-byte reply.
    fn nova_context(st: &Rc<RefCell<NovaState>>, pid: u16) -> (NovaFactory, HidColl) {
        {
            let mut s = st.borrow_mut();
            s.opens = 0;
            s.writes = 0;
            s.reads = 0;
            s.open_ok = true;
            s.write_ok = true;
            s.reply = vec![0u8; 64];
            s.reply[0] = 0x06;
            s.reply[1] = 0xB0;
            s.reply[6] = 4;
            s.reply[15] = 0x08;
        }
        (NovaFactory { sh: st.clone() }, headset_collection(pid))
    }

    #[test]
    fn steelseries_arctis_nova_pro_wireless() {
        let st = Rc::new(RefCell::new(NovaState::default()));

        // Nova Pro Wireless: level, name, key, kind, via, claim and one open/write/read.
        {
            let (mut io, c) = nova_context(&st, 0x225D);
            let mut ctx = PollContext::new(&mut io);
            ctx.colls.push(c);
            poll_steelseries(&mut ctx);
            assert_eq!(ctx.out.len(), 1);
            assert!(ctx.is_claimed(0x1038, 0x225D));
            let s = &ctx.out[0];
            assert_eq!(s.name, "SteelSeries Arctis Nova Pro Wireless");
            assert_eq!(s.key, "steelseries:225D");
            assert_eq!(s.kind, DeviceKind::Headset);
            assert_eq!(s.via, "2.4 GHz receiver");
            assert_eq!(s.percent, 50);
            assert!(s.connected);
            assert!(!s.charging);
            assert_eq!(st.borrow().opens, 1);
            assert_eq!(st.borrow().writes, 1);
            assert_eq!(st.borrow().reads, 1);
        }

        // The receiver's other pid uses the same protocol and its own key.
        {
            let (mut io, c) = nova_context(&st, 0x12E0);
            let mut ctx = PollContext::new(&mut io);
            ctx.colls.push(c);
            poll_steelseries(&mut ctx);
            assert_eq!(ctx.out.len(), 1);
            assert_eq!(ctx.out[0].key, "steelseries:12E0");
            assert_eq!(ctx.out[0].percent, 50);
        }

        // A second FF00 collection is never opened; the product is claimed after the first poll.
        {
            let (mut io, c) = nova_context(&st, 0x225D);
            let mut ctx = PollContext::new(&mut io);
            ctx.colls.push(c.clone());
            let mut ff00 = c;
            ff00.caps.usage_page = 0xFF00;
            ff00.caps.feature_report_byte_length = 64;
            ctx.colls.push(ff00);
            poll_steelseries(&mut ctx);
            assert_eq!(ctx.out.len(), 1);
            assert_eq!(st.borrow().opens, 1);
            assert_eq!(st.borrow().writes, 1);
            assert_eq!(st.borrow().reads, 1);
            poll_steelseries(&mut ctx);
            assert_eq!(st.borrow().opens, 1);  // already claimed
            assert_eq!(st.borrow().writes, 1);
        }

        // FF00 enumerated first: its write is rejected, the FF C0 collection is opened next.
        {
            let (mut io, c) = nova_context(&st, 0x225D);
            let mut other = c.clone();
            other.caps.usage_page = 0xFF00;
            other.caps.feature_report_byte_length = 64;
            let mut ctx = PollContext::new(&mut io);
            ctx.colls.insert(0, other);
            ctx.colls.push(c);
            poll_steelseries(&mut ctx);
            assert_eq!(ctx.out.len(), 1);
            assert_eq!(ctx.out[0].percent, 50);
            assert_eq!(st.borrow().opens, 2);
            assert_eq!(st.borrow().writes, 2);
            assert_eq!(st.borrow().reads, 1);
        }

        // Status 2 (charging): level 0 and 8 both count as charging and stay connected.
        for level in [0u8, 8] {
            let (mut io, c) = nova_context(&st, 0x225D);
            {
                let mut s = st.borrow_mut();
                s.reply[6] = level;
                s.reply[15] = 0x02;
            }
            let mut ctx = PollContext::new(&mut io);
            ctx.colls.push(c);
            poll_steelseries(&mut ctx);
            assert_eq!(ctx.out.len(), 1);
            assert_eq!(ctx.out[0].percent, if level == 0 { 0 } else { 100 });
            assert!(ctx.out[0].connected);
            assert!(ctx.out[0].charging);
        }

        // Status 1 (offline): connected, charging and level are all cleared.
        {
            let (mut io, c) = nova_context(&st, 0x225D);
            st.borrow_mut().reply[15] = 0x01;
            let mut ctx = PollContext::new(&mut io);
            ctx.colls.push(c);
            poll_steelseries(&mut ctx);
            assert_eq!(ctx.out.len(), 1);
            assert!(!ctx.out[0].connected);
            assert!(!ctx.out[0].charging);
            assert_eq!(ctx.out[0].percent, -1);
        }

        // Short replies (0 and 15 bytes, the status byte is at 15) are ignored after one read.
        for length in [0usize, 15] {
            let (mut io, c) = nova_context(&st, 0x225D);
            st.borrow_mut().reply.resize(length, 0);
            let mut ctx = PollContext::new(&mut io);
            ctx.colls.push(c);
            poll_steelseries(&mut ctx);
            assert!(ctx.out.is_empty(), "a {length}-byte reply was accepted");
            assert!(ctx.claimed.is_empty());
            assert_eq!(st.borrow().reads, 1);
        }

        // Write failure: no read happens.
        {
            let (mut io, c) = nova_context(&st, 0x225D);
            st.borrow_mut().write_ok = false;
            let mut ctx = PollContext::new(&mut io);
            ctx.colls.push(c);
            poll_steelseries(&mut ctx);
            assert!(ctx.out.is_empty());
            assert!(ctx.claimed.is_empty());
            assert_eq!(st.borrow().writes, 1);
            assert_eq!(st.borrow().reads, 0);
        }

        // Open failure: no write happens.
        {
            let (mut io, c) = nova_context(&st, 0x225D);
            st.borrow_mut().open_ok = false;
            let mut ctx = PollContext::new(&mut io);
            ctx.colls.push(c);
            poll_steelseries(&mut ctx);
            assert!(ctx.out.is_empty());
            assert!(ctx.claimed.is_empty());
            assert_eq!(st.borrow().opens, 1);
            assert_eq!(st.borrow().writes, 0);
        }

        // Wrong vid/pid/interface or a zero output report length: never opened.
        for invalid in 0..4 {
            let (mut io, c) = nova_context(&st, 0x225D);
            let mut c = c;
            if invalid == 0 { c.vid = 0x1039; }
            if invalid == 1 { c.pid = 0x225E; }
            if invalid == 2 { c.iface = 3; }
            if invalid == 3 { c.caps.output_report_byte_length = 0; }
            let mut ctx = PollContext::new(&mut io);
            ctx.colls.push(c);
            poll_steelseries(&mut ctx);
            assert!(ctx.out.is_empty(), "invalid collection {invalid} was reported");
            assert!(ctx.claimed.is_empty());
            assert_eq!(st.borrow().opens, 0);
            assert_eq!(st.borrow().writes, 0);
        }
    }
}
