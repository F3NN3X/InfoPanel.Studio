//! Keychron wireless mice (VID 3434, e.g. M4), from Keychron's own web Launcher (launcher.keychron.com).
//! 64-byte output report without report id: [01][00][81][01][0...][checksum], checksum (byte 63)
//! = 0xA1 - sum(bytes 0..62). The reply [01][..][..][01][state][rate][vid lo][vid hi][pid lo][pid hi]
//! [charging][battery %]... carries the mouse's own vendor id, which is checked so that only a
//! genuine reply is accepted. Keychron keyboards do not report their battery this way (only over
//! Bluetooth, which the Bluetooth fallback already covers).
//! The 8K mice (M5 8K, G6 HE 8K ... on the TurboLink 8K receiver, Launcher protocol "8k_nordic") use
//! the same request, but on the receiver bit 6 of the first byte is set (41 00 81 01 ...). Their reply
//! [41][..][..][01][..][max rate][..]..[state][battery %][profile] has no vendor id; state 1 =
//! charging, 3 is treated as 0.
//! The 4K mice (M4 4K, M3 4K, M3 mini 4K, M6 4K ... on the Keychron 4K Link receiver, e.g. 3434:D038)
//! use the Launcher protocol "4k" on the FF0A:0001 collection. The Launcher tells it apart from
//! "8k_nordic" by the reply to 01 00 81 01: bytes 6/7 are 34 34 or 2D 36 on 8k_nordic, anything else
//! means "4k". The battery request is the same 41 00 81 01 (bit 6 = ask the mouse over the receiver),
//! but the reply is [41][..][..][01][..][state][battery %][profile]..[max rate]; state != 0 is shown
//! as charging. 40 00 81 00 returns the paired mouse's product id at bytes 4/5, used for its name.
//! The Nape Pro trackball (ZMK firmware) on the Link-KM receiver (3434:D026) uses neither: it is read
//! through the receiver's VIA-style raw HID collection FF60:0061 (unnumbered 32-byte reports). B2 asks
//! the receiver for its three slots (at bytes 2/7/12: vid BE16, pid BE16, status, 1 = connected) and
//! A7 31 is tunnelled to the trackball; the reply A7 31 [battery %][charging] echoes the request.
//! Sources: github.com/nvalis/nape_pro (docs/protocol-reference.md, src/nape_cli/receiver.py, checked
//! on a real D026), github.com/gtun/KeychronNapeBatteryWidget (src/nape_battery.py) and
//! github.com/ky0209/NapeBar. The same request works on the Nape Pro's own USB cable PID (3434:0440).

use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{HidIo, PollContext, hex4, hid_product};
use crate::win::{now_ms, sleep_ms};

fn set_checksum(payload: &mut [u8; 64]) {
    // payload = 64 bytes without the report id
    let mut sum: u32 = 0;
    for i in 0..63 {
        sum += payload[i] as u32;
    }
    payload[63] = 0xA1u32.wrapping_sub(sum) as u8;
}

fn clean_name(n: String) -> String {
    if n.is_empty() || n.contains("Link") || n.contains("Receiver") {
        return "Keychron mouse".into();
    }
    n
}

/// Sends [cmd][00][81][sub] and waits up to 600 ms for a reply starting with cmd whose byte 3 is sub.
fn query(d: &mut dyn HidIo, cmd: u8, r: &mut Vec<u8>, sub: u8) -> bool {
    let mut payload = [0u8; 64];
    payload[0] = cmd;
    payload[2] = 0x81;
    payload[3] = sub;
    set_checksum(&mut payload);
    let mut req: Vec<u8> = vec![0x00]; // report id 0 (unnumbered)
    req.extend_from_slice(&payload);
    d.flush();
    if !d.write(&req, 500) {
        return false;
    }
    let end = now_ms() + 600;
    while (end as i64 - now_ms() as i64) > 0 {
        let left = (end as i64 - now_ms() as i64) as u32;
        if d.read(r, left) < 13 {
            return false;
        }
        if r[0] == cmd && r[3] == sub {
            return true;
        }
    }
    false
}

const LINK_KM: u16 = 0xD026; // Keychron Link-KM 2.4 GHz receiver
const NAPE_USB: u16 = 0x0440; // Nape Pro on its USB cable
const NAPE_IN_SLOT: u16 = 0x4004; // product id the Link-KM reports for a paired Nape Pro

/// Raw HID (FF60:61) request: report id 0 + 32 bytes. Waits up to 600 ms for a reply that starts with
/// the request bytes; the channel also carries unsolicited notifications, which are skipped.
fn raw_query(d: &mut dyn HidIo, cmd: &[u8], r: &mut Vec<u8>) -> bool {
    let mut req: Vec<u8> = vec![0x00];
    req.extend_from_slice(cmd);
    req.resize(33, 0);
    d.flush();
    if !d.write(&req, 500) {
        return false;
    }
    let end = now_ms() + 600;
    while (end as i64 - now_ms() as i64) > 0 {
        let left = (end as i64 - now_ms() as i64) as u32;
        let n = d.read(r, left);
        if n < 0 {
            return false;
        }
        if n < cmd.len() as i32 + 2 {
            continue;
        }
        let mut matches = true;
        for (i, &b) in cmd.iter().enumerate() {
            matches = matches && r[i] == b;
        }
        if matches {
            return true;
        }
    }
    false
}

/// Nape Pro trackball, on the Link-KM receiver or on its USB cable.
fn poll_nape(ctx: &mut PollContext) {
    for &pid in &[LINK_KM, NAPE_USB] {
        for c in ctx.find(0x3434, pid, |c| c.page() == 0xFF60 && c.usage() == 0x61 && c.out_len() == 33) {
            let Some(mut d) = ctx.open(&c) else { continue };
            let mut r: Vec<u8> = Vec::new();
            if pid == LINK_KM {
                // Only ask when a Nape Pro sits in a receiver slot and is connected.
                if !raw_query(d.as_mut(), &[0xB2], &mut r) || r.len() < 17 {
                    continue;
                }
                let mut connected = false;
                for &off in &[2usize, 7, 12] {
                    // The last slot holding a Nape Pro decides (assignment, not OR).
                    if ((r[off + 2] as u16) << 8) | (r[off + 3] as u16) == NAPE_IN_SLOT {
                        connected = r[off + 4] == 1;
                    }
                }
                if !connected {
                    continue;
                }
            }
            if !raw_query(d.as_mut(), &[0xA7, 0x31], &mut r) || r[2] > 100 {
                continue;
            }
            let s = DeviceStatus {
                key: "keychron:nape".into(),
                name: "Keychron Nape Pro".into(),
                kind: DeviceKind::Mouse,
                via: if pid == LINK_KM { "2.4 GHz receiver".into() } else { "USB cable".into() },
                percent: r[2] as i32,
                charging: r[3] != 0,
                ..Default::default()
            };
            ctx.add(s, 0x3434, pid);
            return;
        }
    }
}

/// Product ids the 4K Link reports for its paired mouse (Launcher's productFirmware table).
fn name_4k(product_id: u16) -> Option<&'static str> {
    match product_id {
        0x0620 => Some("Keychron M3 mini 4K"),
        0x0621 => Some("Keychron M4 4K"),
        0x0622 => Some("Keychron M3 mini 4K"),
        0x0624 => Some("Keychron M6 4K"),
        0x07A0 => Some("Keychron M3 4K"),
        _ => None,
    }
}

// Older Keychron mice (M1, M2, M3, M3 mini, M6, M7 ...) on the 1K 2.4 GHz receiver (3434:D030
// Type-A, D031 Type-C), as read by the "Keychron" desktop app (DeviceDriver.exe). The receiver
// exposes a vendor collection on usage page 0x8C (MI_01) with a 1001-byte feature report 0x51.
// SetFeature [51][cmd] queues a command, GetFeature 51 returns the reply [51][cmd][01 = ok]...
// Command 06 (device status) answers [51][06][01][00][vid lo][vid hi][pid lo][pid hi][..][..][..]
// [battery %][charging: 01]; the vid/pid are the mouse's own (e.g. 3434:D033 for an M3).
// Read-only; checked on a real M3 on the D030 receiver.
const LEGACY_A: u16 = 0xD030; // 1K receiver, Type-A
const LEGACY_C: u16 = 0xD031; // 1K receiver, Type-C
const LEGACY_REPORT: u8 = 0x51;
const LEGACY_STATUS: u8 = 0x06;

fn legacy_name(pid: u16) -> &'static str {
    match pid {
        0xD032 | 0xD033 => "Keychron M3",
        0xD035 => "Keychron M1",
        0xD036 | 0xD03E => "Keychron M3 mini",
        0xD03B => "Keychron M2",
        0xD03D => "Keychron M2 mini",
        0xD03F => "Keychron M6",
        0xD044 => "Keychron M7",
        _ => "Keychron mouse",
    }
}

fn poll_legacy(ctx: &mut PollContext) {
    for &rpid in &[LEGACY_A, LEGACY_C] {
        for c in ctx.find(0x3434, rpid, |c| c.page() == 0x8C && c.feat_len() >= 16) {
            let Some(mut d) = ctx.open(&c).or_else(|| ctx.open_feature_only(&c)) else { continue };
            if !d.set_feature(&[LEGACY_REPORT, LEGACY_STATUS]) {
                continue;
            }
            let mut r: Vec<u8> = Vec::new();
            let mut got = false;
            let mut i = 0;
            while i < 5 && !got {
                // the reply is usually there at once; give the mouse up to ~200 ms
                sleep_ms(40);
                got = d.get_feature(LEGACY_REPORT, &mut r) && r.len() >= 13 && r[0] == LEGACY_REPORT && r[1] == LEGACY_STATUS;
                i += 1;
            }
            if !got || r[2] != 0x01 || (r[4] as u16 | ((r[5] as u16) << 8)) != 0x3434 || r[11] > 100 {
                continue;
            }
            let mpid = (r[6] as u16) | ((r[7] as u16) << 8);
            let s = DeviceStatus {
                key: format!("keychron:{}", hex4(mpid)),
                name: legacy_name(mpid).into(),
                kind: DeviceKind::Mouse,
                via: "2.4 GHz receiver".into(),
                percent: r[11] as i32,
                charging: r[12] == 0x01,
                ..Default::default()
            };
            ctx.add(s, 0x3434, rpid);
            break;
        }
    }
}

pub fn poll_keychron(ctx: &mut PollContext) {
    poll_nape(ctx);
    poll_legacy(ctx);
    for &(vid, pid) in &ctx.products(0x3434) {
        for c in ctx.find(vid, pid, |c| c.page() >= 0xFF00 && c.out_len() == 65 && c.in_len() == 65) {
            let Some(mut d) = ctx.open(&c) else { continue };
            let mut r: Vec<u8> = Vec::new();
            let mut r1: Vec<u8> = Vec::new();
            let mut percent: i32 = -1;
            let mut charging = false;
            let mut wireless = true;
            let got1 = query(d.as_mut(), 0x01, &mut r1, 0x01);
            let tag: u16 = if got1 { (r1[6] as u16) | ((r1[7] as u16) << 8) } else { 0 };
            if got1 && c.page() == 0xFF0A && c.usage() == 0x01 && tag != 0x3434 && tag != 0x362D {
                // 4K mouse on the 4K Link receiver (Launcher protocol "4k"); the 8K layout does not apply.
                if !query(d.as_mut(), 0x41, &mut r, 0x01) || r[6] < 1 || r[6] > 100 {
                    continue;
                }
                let mut s = DeviceStatus {
                    key: format!("keychron:{}", hex4(pid)),
                    name: clean_name(hid_product(&c)),
                    kind: DeviceKind::Mouse,
                    via: "2.4 GHz receiver".into(),
                    percent: r[6] as i32,
                    charging: r[5] != 0,
                    ..Default::default()
                };
                let mut st: Vec<u8> = Vec::new();
                if query(d.as_mut(), 0x40, &mut st, 0x00) {
                    if let Some(n) = name_4k((st[4] as u16) | ((st[5] as u16) << 8)) {
                        s.name = n.into();
                    }
                }
                ctx.add(s, vid, pid);
                break;
            }
            if got1 && tag == 0x3434 && r1[11] <= 100 {
                percent = r1[11] as i32; // M4 and other mice on the classic protocol: the reply carries the vendor id
                charging = r1[10] != 0;
            } else if query(d.as_mut(), 0x41, &mut r, 0x01) && r[10] <= 3 && r[11] <= 100 {
                percent = r[11] as i32; // 8K mouse on its receiver
                charging = r[10] == 1;
            } else if got1 && r1[10] <= 3 && r1[11] >= 1 && r1[11] <= 100 && r1[5] >= 1 && r1[5] <= 8 {
                percent = r1[11] as i32; // 8K mouse on the USB cable (no bit 6); byte 5 = highest polling rate level
                charging = r1[10] == 1;
                wireless = false;
            }
            if percent < 0 {
                continue;
            }
            let s = DeviceStatus {
                key: format!("keychron:{}", hex4(pid)),
                name: clean_name(hid_product(&c)),
                kind: DeviceKind::Mouse,
                via: if wireless { "2.4 GHz receiver".into() } else { "USB cable".into() },
                percent,
                charging,
                ..Default::default()
            };
            ctx.add(s, vid, pid);
            break;
        }
    }
}

#[cfg(test)]
mod tests {
    //! Port of tests/keychron_driver_test.cpp: exercise the Keychron mouse driver with a simulated
    //! HID transport; no hardware access.
    //!
    //! The C++ mock keys its script by the request's (command, sub) bytes and serves 0x51 feature
    //! reports through a 1001-byte buffer; the shared mock keys on the first two bytes of a request
    //! (which are the report id 0 and the command here) and has no feature-report buffering, so
    //! this test brings its own transport, like the C++ program did.
    use super::*;
    use crate::devices::DeviceStatus;
    use crate::hid::{HidCaps, HidColl, HidFactory, HidIo, PollContext};
    use std::cell::RefCell;
    use std::collections::{BTreeSet, HashMap};
    use std::rc::Rc;

    #[derive(Default)]
    struct State {
        script: HashMap<(u8, u8), Vec<u8>>,
        pending: Vec<Vec<u8>>,
        writes: Vec<Vec<u8>>,
        feature_writes: Vec<Vec<u8>>,
        feature_reply: Vec<u8>,
        feature_queued: bool,
        opens: u32,
    }

    struct Dev {
        sh: Rc<RefCell<State>>,
        feat_len: u16,
    }

    impl HidIo for Dev {
        fn write(&mut self, data: &[u8], _timeout_ms: u32) -> bool {
            assert_eq!(data.len(), 65);
            assert_eq!(data[0], 0);
            let mut sh = self.sh.borrow_mut();
            sh.writes.push(data.to_vec());
            if let Some(reply) = sh.script.get(&(data[1], data[4])).cloned() {
                sh.pending.push(reply);
            }
            true
        }
        fn read(&mut self, buf: &mut Vec<u8>, timeout_ms: u32) -> i32 {
            assert!(timeout_ms > 0 && timeout_ms <= 600);
            let mut sh = self.sh.borrow_mut();
            if sh.pending.is_empty() {
                return -1;
            }
            let r = sh.pending.remove(0);
            buf.clear();
            buf.extend_from_slice(&r);
            r.len() as i32
        }
        fn set_output_and_read(&mut self, _data: &[u8], _buf: &mut Vec<u8>, _timeout_ms: u32) -> i32 {
            -1
        }
        fn flush(&mut self) {
            self.sh.borrow_mut().pending.clear();
        }
        fn set_feature(&mut self, data: &[u8]) -> bool {
            let mut sh = self.sh.borrow_mut();
            sh.feature_writes.push(data.to_vec());
            sh.feature_queued = data.len() >= 2 && data[0] == 0x51 && data[1] == 0x06 && !sh.feature_reply.is_empty();
            true
        }
        fn get_feature(&mut self, report_id: u8, out: &mut Vec<u8>) -> bool {
            assert_eq!(report_id, 0x51);
            let sh = self.sh.borrow_mut();
            out.clear();
            out.resize(self.feat_len as usize, 0);
            out[0] = report_id;
            if !sh.feature_queued {
                return true;
            } // nothing queued yet: the report reads back empty
            let n = sh.feature_reply.len().min(out.len());
            out[..n].copy_from_slice(&sh.feature_reply[..n]);
            true
        }
        fn get_input_report(&mut self, _id: u8, _out: &mut Vec<u8>) -> bool {
            false
        }
    }

    struct Factory {
        sh: Rc<RefCell<State>>,
    }

    impl Factory {
        fn writes(&self) -> Vec<Vec<u8>> {
            self.sh.borrow().writes.clone()
        }
        fn feature_writes(&self) -> Vec<Vec<u8>> {
            self.sh.borrow().feature_writes.clone()
        }
        fn opens(&self) -> u32 {
            self.sh.borrow().opens
        }
    }

    impl HidFactory for Factory {
        fn open(&mut self, coll: &HidColl) -> Option<Box<dyn HidIo>> {
            self.sh.borrow_mut().opens += 1;
            Some(Box::new(Dev { sh: self.sh.clone(), feat_len: coll.feat_len() }))
        }
        fn open_read_only(&mut self, coll: &HidColl) -> Option<Box<dyn HidIo>> {
            self.open(coll)
        }
        fn open_feature_only(&mut self, coll: &HidColl) -> Option<Box<dyn HidIo>> {
            self.open(coll)
        }
    }

    fn collection(pid: u16, page: u16, usage: u16) -> HidColl {
        HidColl {
            path: "keychron".into(),
            vid: 0x3434,
            pid,
            caps: HidCaps { usage_page: page, usage, input_report_byte_length: 65, output_report_byte_length: 65, ..Default::default() },
            ..Default::default()
        }
    }

    /// 1K receiver (D030/D031): feature report 0x51 on the vendor collection of usage page 0x8C.
    fn legacy_collection(pid: u16) -> HidColl {
        HidColl {
            path: "keychron-1k".into(),
            vid: 0x3434,
            pid,
            caps: HidCaps { usage_page: 0x8C, usage: 0x01, feature_report_byte_length: 1001, ..Default::default() },
            ..Default::default()
        }
    }

    /// 64-byte input report as Read() hands it to the driver (report id 0 already dropped).
    fn reply(cmd: u8, sub: u8, bytes: &[(usize, u8)]) -> Vec<u8> {
        let mut r = vec![0u8; 64];
        r[0] = cmd;
        r[2] = 0x81;
        r[3] = sub;
        for &(i, v) in bytes {
            r[i] = v;
        }
        r
    }

    /// The exact output report the driver must send: report id 0, [cmd][00][81][sub], zeros, checksum.
    fn request(cmd: u8, sub: u8, checksum: u8) -> Vec<u8> {
        let mut w = vec![0u8; 65];
        w[1] = cmd;
        w[3] = 0x81;
        w[4] = sub;
        w[64] = checksum;
        w
    }

    /// Status reply [51][06][ok][00][vid lo][vid hi][pid lo][pid hi][..][..][..][battery %][charging].
    fn status(ok: u8, vid: u16, pid: u16, battery: u8, charging: u8) -> Vec<u8> {
        vec![0x51, 0x06, ok, 0x00, vid as u8, (vid >> 8) as u8, pid as u8, (pid >> 8) as u8, 0, 0, 0, battery, charging]
    }

    fn poll_with(
        coll: HidColl,
        script: Vec<((u8, u8), Vec<u8>)>,
        feature_reply: Vec<u8>,
    ) -> (Factory, Vec<DeviceStatus>, BTreeSet<(u16, u16)>) {
        let state = State { feature_reply, ..Default::default() };
        let sh = Rc::new(RefCell::new(state));
        {
            let mut st = sh.borrow_mut();
            for (key, value) in script {
                st.script.insert(key, value);
            }
        }
        let mut f = Factory { sh };
        let (out, claimed) = {
            let mut ctx = PollContext::new(&mut f);
            ctx.colls = vec![coll];
            poll_keychron(&mut ctx);
            (ctx.out, ctx.claimed)
        };
        (f, out, claimed)
    }

    fn poll(coll: HidColl, script: Vec<((u8, u8), Vec<u8>)>) -> (Factory, Vec<DeviceStatus>, BTreeSet<(u16, u16)>) {
        poll_with(coll, script, vec![])
    }

    #[test]
    fn keychron_driver_test() {
        let ask01 = request(0x01, 0x01, 0x1E); // 0xA1 - (01 + 81 + 01)
        let ask41 = request(0x41, 0x01, 0xDE); // 0xA1 - (41 + 81 + 01)
        let ask40 = request(0x40, 0x00, 0xE0); // 0xA1 - (40 + 81 + 00)
        let link4k = collection(0xD038, 0xFF0A, 0x01);

        // 4K Link: 01 reply without 34 34 / 2D 36 at bytes 6/7 selects the "4k" layout. Battery at
        // byte 6, state at byte 5 (non-zero = charging), paired mouse's product id at bytes 4/5 of
        // the 40 reply.
        let (io, out, claimed) = poll(
            link4k.clone(),
            vec![
                ((0x01, 0x01), reply(0x01, 0x01, &[(6, 0x12), (7, 0x05)])),
                ((0x41, 0x01), reply(0x41, 0x01, &[(5, 1), (6, 73), (7, 2), (10, 0), (11, 0)])),
                ((0x40, 0x00), reply(0x40, 0x00, &[(4, 0x21), (5, 0x06)])),
            ],
        );
        assert_eq!(io.writes(), vec![ask01.clone(), ask41.clone(), ask40.clone()]);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].key, "keychron:D038");
        assert_eq!(out[0].name, "Keychron M4 4K");
        assert_eq!(out[0].percent, 73);
        assert!(out[0].charging);
        assert_eq!(out[0].kind, DeviceKind::Mouse);
        assert_eq!(out[0].via, "2.4 GHz receiver");
        assert!(claimed.contains(&(0x3434, 0xD038)));

        // State 0 = not charging; any other state counts as charging. The last case gets no 40 reply.
        let (_io, out, _) = poll(
            link4k.clone(),
            vec![
                ((0x01, 0x01), reply(0x01, 0x01, &[])),
                ((0x41, 0x01), reply(0x41, 0x01, &[(5, 0), (6, 100)])),
                ((0x40, 0x00), reply(0x40, 0x00, &[(4, 0xA0), (5, 0x07)])),
            ],
        );
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].percent, 100);
        assert!(!out[0].charging);
        assert_eq!(out[0].name, "Keychron M3 4K");
        let (io, out, _) =
            poll(link4k.clone(), vec![((0x01, 0x01), reply(0x01, 0x01, &[])), ((0x41, 0x01), reply(0x41, 0x01, &[(5, 2), (6, 40)]))]);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].percent, 40);
        assert!(out[0].charging);

        // Without a 40 reply, or with an unknown product id, the receiver name is not used and no
        // model is invented.
        assert_eq!(io.writes(), vec![ask01.clone(), ask41.clone(), ask40.clone()]);
        assert_eq!(out[0].name, "Keychron mouse");
        let (_io, out, _) = poll(
            link4k.clone(),
            vec![
                ((0x01, 0x01), reply(0x01, 0x01, &[])),
                ((0x41, 0x01), reply(0x41, 0x01, &[(6, 55)])),
                ((0x40, 0x00), reply(0x40, 0x00, &[(4, 0x99), (5, 0x09)])),
            ],
        );
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].name, "Keychron mouse");
        assert_eq!(out[0].percent, 55);

        // Battery 0 or out of range on the 4K path: nothing listed, nothing claimed, no 40 query.
        for bad in [0u8, 101, 0xFF] {
            let (io, out, claimed) = poll(
                link4k.clone(),
                vec![((0x01, 0x01), reply(0x01, 0x01, &[])), ((0x41, 0x01), reply(0x41, 0x01, &[(5, 1), (6, bad), (10, 1), (11, 50)]))],
            );
            assert!(out.is_empty());
            assert!(claimed.is_empty());
            assert_eq!(io.writes(), vec![ask01.clone(), ask41.clone()]);
        }

        // No reply at all (mouse asleep / unpaired): nothing listed or claimed.
        let (io, out, claimed) = poll(link4k.clone(), vec![]);
        assert!(out.is_empty());
        assert!(claimed.is_empty());
        assert_eq!(io.writes(), vec![ask01.clone(), ask41.clone()]);
        // 01 answered but 41 not: still nothing.
        let (io, out, claimed) = poll(link4k.clone(), vec![((0x01, 0x01), reply(0x01, 0x01, &[]))]);
        assert!(out.is_empty());
        assert!(claimed.is_empty());
        assert_eq!(io.writes(), vec![ask01.clone(), ask41.clone()]);

        // 8K Nordic tag 34 34 at bytes 6/7 on the same collection: unchanged classic path, battery
        // at byte 11, charging at byte 10, only the 01 query is sent.
        let receiver8k = collection(0xD028, 0xFF0A, 0x01);
        let (io, out, _) = poll(
            receiver8k.clone(),
            vec![
                ((0x01, 0x01), reply(0x01, 0x01, &[(5, 0), (6, 0x34), (7, 0x34), (10, 1), (11, 64)])),
                ((0x41, 0x01), reply(0x41, 0x01, &[(6, 99)])),
            ],
        );
        assert_eq!(io.writes(), vec![ask01.clone()]);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].key, "keychron:D028");
        assert_eq!(out[0].percent, 64);
        assert!(out[0].charging);
        assert_eq!(out[0].name, "Keychron mouse");
        assert_eq!(out[0].via, "2.4 GHz receiver");

        // 8K Nordic tag 2D 36: the 8K receiver layout of the 41 reply (state byte 10, battery byte
        // 11), not the 4K one (byte 6 is ignored).
        let (io, out, _) = poll(
            receiver8k.clone(),
            vec![
                ((0x01, 0x01), reply(0x01, 0x01, &[(6, 0x2D), (7, 0x36)])),
                ((0x41, 0x01), reply(0x41, 0x01, &[(5, 1), (6, 99), (10, 3), (11, 81)])),
                ((0x40, 0x00), reply(0x40, 0x00, &[(4, 0x21), (5, 0x06)])),
            ],
        );
        assert_eq!(io.writes(), vec![ask01.clone(), ask41.clone()]);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].percent, 81);
        assert!(!out[0].charging);
        assert_eq!(out[0].name, "Keychron mouse");

        // Collections that are not 65/65 vendor-page ones are never opened.
        let mut short_report = link4k.clone();
        short_report.caps.input_report_byte_length = 33;
        let mut mouse_page = link4k.clone();
        mouse_page.caps.usage_page = 0x01;
        for c in [short_report, mouse_page] {
            let (io, out, _) = poll(c, vec![((0x01, 0x01), reply(0x01, 0x01, &[]))]);
            assert!(out.is_empty());
            assert!(io.writes().is_empty());
            assert_eq!(io.opens(), 0);
        }

        // 1K receiver (D030): M3 (D033) at 87 %, not charging. Only the status command is sent, the
        // receiver is claimed and the 65-byte protocol is not tried on it.
        let legacy_a = legacy_collection(0xD030);
        let (io, out, claimed) = poll_with(legacy_a.clone(), vec![], status(0x01, 0x3434, 0xD033, 87, 0x00));
        assert_eq!(io.feature_writes(), vec![vec![0x51, 0x06]]);
        assert!(io.writes().is_empty());
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].key, "keychron:D033");
        assert_eq!(out[0].name, "Keychron M3");
        assert_eq!(out[0].percent, 87);
        assert!(!out[0].charging);
        assert_eq!(out[0].kind, DeviceKind::Mouse);
        assert_eq!(out[0].via, "2.4 GHz receiver");
        assert!(claimed.contains(&(0x3434, 0xD030)));

        // Type-C receiver (D031), charging; an unknown mouse pid gets the generic name.
        let (_io, out, claimed) = poll_with(legacy_collection(0xD031), vec![], status(0x01, 0x3434, 0xD0FF, 100, 0x01));
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].percent, 100);
        assert!(out[0].charging);
        assert_eq!(out[0].name, "Keychron mouse");
        assert!(claimed.contains(&(0x3434, 0xD031)));

        // Error status, foreign vendor id, battery out of range, or no reply: nothing listed or claimed.
        for bad in
            [status(0x00, 0x3434, 0xD033, 50, 0), status(0x01, 0x1234, 0xD033, 50, 0), status(0x01, 0x3434, 0xD033, 101, 0), Vec::new()]
        {
            let (_io, out, claimed) = poll_with(legacy_a.clone(), vec![], bad);
            assert!(out.is_empty());
            assert!(claimed.is_empty());
        }

        // The same usage page without a feature report, or another receiver pid: never opened.
        let mut no_feature = legacy_a.clone();
        no_feature.caps.feature_report_byte_length = 0;
        let other_pid = legacy_collection(0xD038);
        for c in [no_feature, other_pid] {
            let (io, out, _) = poll_with(c, vec![], status(0x01, 0x3434, 0xD033, 87, 0));
            assert!(out.is_empty());
            assert!(io.feature_writes().is_empty());
            assert_eq!(io.opens(), 0);
        }
    }
}
