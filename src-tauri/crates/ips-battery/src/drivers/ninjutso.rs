//! Ninjutso mice:
//!  * Sora V2, on its 1K receiver (1915:AE1C) or the USB cable (1915:AE11): NinjaForce bundled
//!    out/renderer/assets/createSoraV2-DL6g5ddD.js, createSorav2.readState(). Feature report 05,
//!    command 15: [9] battery (0 means 100%), [10] charging, [12] online. Indices include the report ID,
//!    as in WebHID's returned DataView. On the cable the same query answers with [12] = 0 (tested on a
//!    Sora V2), so the mouse counts as connected there, as with the Sprime PM1 (see sprime.rs).
//!    The "0 means 100%" rule is applied on the cable too; a full battery on the cable has not been
//!    captured yet.
//!  * Ten / Ten Air (093A:EB01 receiver, 093A:E020 USB cable): NinjaForce (https://www.ninjaforce.co/)
//!    and https://github.com/DrStopor/ninjutso-battery-tray. Feature report 06 (16 bytes) on
//!    FF01:0001; commands 0x13 (online), 0x12 (battery %), 0x11 (charging), value at byte 8.
//!    Verified on Ninjutso Ten Air (093A:EB01 and 093A:E020).
use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{HidIo, PollContext, hex4, hid_product};
use crate::win::sleep_ms;

fn query_ten(d: &mut dyn HidIo, cmd: u8, value: &mut u8) -> bool {
    let mut q = vec![0u8; 16];
    q[0] = 0x06;
    q[1] = cmd;
    q[4] = 1;
    if !d.set_feature(&q) {
        return false;
    }
    for _attempt in 0..3 {
        sleep_ms(30);
        let mut r = Vec::new();
        if d.get_feature(0x06, &mut r) && r.len() == 16 && r[0] == 0x06 && r[1] == cmd {
            *value = r[8];
            return true;
        }
    }
    false
}

fn poll_ten(ctx: &mut PollContext) {
    for &(vid, pid) in &ctx.products(0x093A) {
        if pid != 0xEB01 && pid != 0xE020 {
            continue;
        }
        for c in ctx.find(vid, pid, |c| c.page() == 0xFF01 && c.usage() == 1 && c.feat_len() == 16) {
            let Some(mut d) = ctx.open_feature_only(&c) else { continue };
            let (mut online, mut percent, mut charging) = (0u8, 0u8, 0u8);
            if !query_ten(&mut *d, 0x13, &mut online)
                || online != 1
                || !query_ten(&mut *d, 0x12, &mut percent)
                || percent > 100
                || !query_ten(&mut *d, 0x11, &mut charging)
            {
                continue;
            }
            let mut name = hid_product(&c);
            if name.is_empty() {
                name = "Ninjutso Ten / Ten Air".into();
            }
            let s = DeviceStatus {
                key: format!("ninjutso-ten:{}", hex4(pid)),
                name,
                kind: DeviceKind::Mouse,
                via: if pid == 0xE020 { "USB cable" } else { "2.4 GHz receiver" }.into(),
                percent: percent as i32,
                charging: charging != 0,
                ..Default::default()
            };
            ctx.add(s, vid, pid);
            break;
        }
    }
}

pub fn poll_ninjutso(ctx: &mut PollContext) {
    const VID: u16 = 0x1915;
    const RECEIVER_PID: u16 = 0xAE1C;
    const CABLE_PID: u16 = 0xAE11;
    for pid in [RECEIVER_PID, CABLE_PID] {
        if ctx.is_claimed(VID, pid) {
            continue;
        }
        let cable = pid == CABLE_PID;
        for c in ctx.find(VID, pid, |c| c.page() == 0xFFA0 && c.usage() == 1 && c.feat_len() >= 32) {
            let Some(mut d) = ctx.open_feature_only(&c) else { continue };
            let mut req = vec![0u8; 32];
            req[0] = 0x05;
            req[1] = 0x15;
            req[4] = 1;
            let mut s = DeviceStatus { ..Default::default() };
            let mut answered = false;
            for attempt in 0..4 {
                if attempt != 0 {
                    sleep_ms(90);
                }
                if !d.set_feature(&req) {
                    break;
                }
                sleep_ms(15);
                let mut r = Vec::new();
                if !d.get_feature(0x05, &mut r) || r.len() < 13 || r[0] != 0x05 || r[1] != 0x15 || r[9] > 100 {
                    continue;
                }
                answered = true;
                s.connected = cable || r[12] != 0;
                s.percent = if s.connected { if r[9] == 0 { 100 } else { r[9] as i32 } } else { -1 };
                s.charging = s.connected && r[10] != 0;
                if s.connected {
                    break;
                }
            }
            if !answered {
                continue;
            }
            s.key = format!("ninjutso:{}:{}", hex4(VID), hex4(pid));
            s.name = "Ninjutso Sora V2".into();
            s.kind = DeviceKind::Mouse;
            s.via = if cable { "USB cable" } else { "2.4 GHz receiver" }.into();
            ctx.add(s, VID, pid);
            break;
        }
    }
    poll_ten(ctx);
}

#[cfg(test)]
mod tests {
    //! Ported from tests/ninjutso_driver_test.cpp (Sora V2 receiver, Ten / Ten Air) and
    //! tests/ninjutso_cable_test.cpp (Sora V2 receiver + USB cable).
    //!
    //! The two C++ programs each provide their own whole `HidDev` (link-time substitution) plus a
    //! process-global mock state; one `Fixture` below is that state, shared by both tests the way
    //! each C++ program had its own globals. The bespoke transport validates every write and the
    //! feature report id, and counts opens/queries/feature reads exactly like the C++ mocks did —
    //! behaviour the shared `MockFactory` cannot express, so (per TEST-CONVENTIONS.md) the test
    //! module implements `HidIo`/`HidFactory` itself.
    use super::*;
    use crate::devices::DeviceStatus;
    use crate::hid::test_seam::with_product;
    use crate::hid::{HidCaps, HidColl, HidFactory};
    use std::cell::RefCell;
    use std::collections::{BTreeSet, VecDeque};
    use std::rc::Rc;

    /// The C++ test globals: `replies`, `writes`, `opens`, `queries`, `featureReads`, `openOk`,
    /// `sendOk`.
    #[derive(Default)]
    struct State {
        replies: VecDeque<Vec<u8>>,
        /// `writes`: set_feature payloads on the Ten collection (093A) only, as in the C++ mock.
        writes: Vec<Vec<u8>>,
        opens: u32,
        /// Every set_feature call, both product families.
        queries: u32,
        /// get_feature calls on the Ten collection (the C++ mock counts before it checks replies).
        feature_reads: u32,
        open_ok: bool,
        send_ok: bool,
    }

    struct TestIo {
        sh: Rc<RefCell<State>>,
        coll: HidColl,
    }

    impl HidIo for TestIo {
        fn write(&mut self, _data: &[u8], _timeout_ms: u32) -> bool {
            false
        }
        fn read(&mut self, _buf: &mut Vec<u8>, _timeout_ms: u32) -> i32 {
            -1
        }
        fn set_output_and_read(&mut self, _data: &[u8], _buf: &mut Vec<u8>, _timeout_ms: u32) -> i32 {
            -1
        }
        fn flush(&mut self) {}

        fn set_feature(&mut self, data: &[u8]) -> bool {
            let mut sh = self.sh.borrow_mut();
            if self.coll.vid == 0x093A {
                assert_eq!(data.len(), 16);
                assert!(data[0] == 0x06 && data[4] == 1);
                for i in 2..data.len() {
                    if i != 4 {
                        assert_eq!(data[i], 0, "Ten query byte {i} must be zero");
                    }
                }
                sh.writes.push(data.to_vec());
            } else {
                let mut expected = vec![0u8; 32];
                expected[0] = 5;
                expected[1] = 0x15;
                expected[4] = 1;
                // Only the documented state query can be sent.
                assert_eq!(data, &expected[..]);
            }
            sh.queries += 1;
            sh.send_ok
        }

        fn get_feature(&mut self, report_id: u8, out: &mut Vec<u8>) -> bool {
            let mut sh = self.sh.borrow_mut();
            if self.coll.vid == 0x093A {
                assert_eq!(report_id, 0x06);
                sh.feature_reads += 1;
            } else {
                assert_eq!(report_id, 5);
            }
            match sh.replies.pop_front() {
                // An empty reply counts as answered (the C++ mock popped it too); the driver
                // rejects it on length.
                Some(r) => {
                    *out = r;
                    true
                }
                None => false,
            }
        }

        fn get_input_report(&mut self, _report_id: u8, _out: &mut Vec<u8>) -> bool {
            false
        }
    }

    struct TestFactory {
        sh: Rc<RefCell<State>>,
    }

    impl HidFactory for TestFactory {
        fn open(&mut self, coll: &HidColl) -> Option<Box<dyn HidIo>> {
            self.open_feature_only(coll)
        }
        fn open_read_only(&mut self, coll: &HidColl) -> Option<Box<dyn HidIo>> {
            self.open_feature_only(coll)
        }
        fn open_feature_only(&mut self, coll: &HidColl) -> Option<Box<dyn HidIo>> {
            let mut sh = self.sh.borrow_mut();
            sh.opens += 1;
            if !sh.open_ok {
                return None;
            }
            Some(Box::new(TestIo { sh: self.sh.clone(), coll: coll.clone() }))
        }
    }

    /// What one C++ `Poll(...)` / `PollTenRun(...)` leaves behind.
    struct Outcome {
        out: Vec<DeviceStatus>,
        claimed: BTreeSet<(u16, u16)>,
        opens: u32,
        queries: u32,
        feature_reads: u32,
        writes: Vec<Vec<u8>>,
    }

    impl Outcome {
        fn is_claimed(&self, vid: u16, pid: u16) -> bool {
            self.claimed.contains(&(vid, pid))
        }
    }

    struct Fixture {
        sh: Rc<RefCell<State>>,
    }

    impl Fixture {
        fn new() -> Fixture {
            // openOk = sendOk = true, as in both C++ programs.
            Fixture { sh: Rc::new(RefCell::new(State { open_ok: true, send_ok: true, ..Default::default() })) }
        }
        fn set_open_ok(&self, ok: bool) {
            self.sh.borrow_mut().open_ok = ok;
        }
        fn set_send_ok(&self, ok: bool) {
            self.sh.borrow_mut().send_ok = ok;
        }
        fn opens(&self) -> u32 {
            self.sh.borrow().opens
        }
        fn queries(&self) -> u32 {
            self.sh.borrow().queries
        }
        fn reset_opens(&self) {
            self.sh.borrow_mut().opens = 0;
        }

        /// The C++ `Poll`/`PollTenRun` preamble: replace the replies, clear the per-poll counters
        /// (`PollTenRun` also resets `opens`, `Poll` only resets queries/featureReads/writes).
        fn prepare(&self, replies: Vec<Vec<u8>>, reset_opens: bool) {
            let mut sh = self.sh.borrow_mut();
            sh.replies = replies.into();
            sh.writes.clear();
            sh.queries = 0;
            sh.feature_reads = 0;
            if reset_opens {
                sh.opens = 0;
            }
        }

        /// C++ `Poll(...)` / `PollTenRun(...)`: one poll over `colls`, results collected while the
        /// fixture still owns the mock state.
        fn poll(&self, replies: Vec<Vec<u8>>, colls: Vec<HidColl>, reset_opens: bool) -> Outcome {
            self.prepare(replies, reset_opens);
            let mut f = TestFactory { sh: self.sh.clone() };
            let mut ctx = PollContext::new(&mut f);
            ctx.colls = colls;
            poll_ninjutso(&mut ctx);
            let sh = self.sh.borrow();
            Outcome {
                out: ctx.out,
                claimed: ctx.claimed,
                opens: sh.opens,
                queries: sh.queries,
                feature_reads: sh.feature_reads,
                writes: sh.writes.clone(),
            }
        }

        /// The C++ "poll again on the same context" step: the replies were consumed by the first
        /// poll and the context still holds what it reported and claimed. Returns
        /// (out.len() after the second poll, opens before, opens after).
        fn repoll(&self, first: &Outcome, colls: Vec<HidColl>) -> (usize, u32, u32) {
            self.prepare(Vec::new(), false);
            let before = self.sh.borrow().opens;
            let mut f = TestFactory { sh: self.sh.clone() };
            let mut ctx = PollContext::new(&mut f);
            ctx.colls = colls;
            ctx.claimed = first.claimed.clone();
            ctx.out = first.out.clone();
            poll_ninjutso(&mut ctx);
            (ctx.out.len(), before, self.sh.borrow().opens)
        }
    }

    fn collection() -> HidColl {
        HidColl {
            vid: 0x1915,
            pid: 0xAE1C,
            caps: HidCaps { usage_page: 0xFFA0, usage: 1, feature_report_byte_length: 704, ..Default::default() },
            ..Default::default()
        }
    }

    fn ten_coll(pid: u16) -> HidColl {
        HidColl {
            path: "test".into(),
            vid: 0x093A,
            pid,
            caps: HidCaps { usage_page: 0xFF01, usage: 1, feature_report_byte_length: 16, ..Default::default() },
            ..Default::default()
        }
    }

    fn status_of(battery: u8, charging: bool, online: bool) -> Vec<u8> {
        let mut r = vec![0u8; 32];
        r[0] = 5;
        r[1] = 0x15;
        r[9] = battery;
        r[10] = charging as u8;
        r[12] = online as u8;
        r
    }

    fn status(battery: u8) -> Vec<u8> {
        status_of(battery, false, true)
    }

    fn ten_reply(cmd: u8, value: u8) -> Vec<u8> {
        let mut r = vec![0u8; 16];
        r[0] = 0x06;
        r[1] = cmd;
        r[8] = value;
        r
    }

    #[test]
    fn ninjutso_driver() {
        let fx = Fixture::new();

        // ---- Sora V2 on the 1K receiver (1915:AE1C) ----
        let o = fx.poll(vec![status(32)], vec![collection()], false);
        assert!(o.out.len() == 1 && o.is_claimed(0x1915, 0xAE1C));
        let s = &o.out[0];
        assert!(s.percent == 32 && s.connected && !s.charging);
        assert!(s.name == "Ninjutso Sora V2" && s.key == "ninjutso:1915:AE1C");
        assert!(s.kind == DeviceKind::Mouse && s.via == "2.4 GHz receiver");
        assert_eq!(o.queries, 1);
        // Polled again on the same context: the claimed receiver is not opened a second time.
        let (out_len, before, after) = fx.repoll(&o, vec![collection()]);
        assert!(after == before && out_len == 1);

        let o = fx.poll(vec![status_of(0, true, true)], vec![collection()], false);
        assert!(o.out.len() == 1 && o.out[0].percent == 100 && o.out[0].charging);
        let o = fx.poll(vec![status_of(32, true, false), status(31)], vec![collection()], false);
        assert!(o.out.len() == 1 && o.out[0].percent == 31 && o.queries == 2);
        let o = fx.poll(vec![status_of(0, true, false); 4], vec![collection()], false);
        assert!(o.out.len() == 1 && !o.out[0].connected && !o.out[0].charging && o.out[0].percent == -1);
        assert_eq!(o.queries, 4);

        let mut wrong_id = status(32);
        let mut wrong_command = status(32);
        wrong_id[0] = 4;
        wrong_command[1] = 0x28;
        let o = fx.poll(vec![wrong_id, wrong_command, vec![0u8; 12], status(101)], vec![collection()], false);
        assert!(o.out.is_empty() && o.claimed.is_empty() && o.queries == 4);
        let o = fx.poll(Vec::new(), vec![collection()], false);
        assert!(o.out.is_empty() && o.claimed.is_empty() && o.queries == 4);
        fx.set_send_ok(false);
        let o = fx.poll(vec![status(32)], vec![collection()], false);
        assert!(o.out.is_empty() && o.queries == 1);
        fx.set_send_ok(true);

        let mut other_vendor = collection();
        let mut other_product = collection();
        let mut other_page = collection();
        let mut other_usage = collection();
        let mut short_report = collection();
        other_vendor.vid = 0x1234;
        other_product.pid = 0xAE8C; // 8K receiver is outside the verified scope
        other_page.caps.usage_page = 1;
        other_usage.caps.usage = 2;
        short_report.caps.feature_report_byte_length = 31;
        let before = fx.opens();
        let o = fx.poll(Vec::new(), vec![other_vendor, other_product, other_page, other_usage, short_report], false);
        assert!(o.opens == before && o.out.is_empty());

        // ---- Ninjutso Ten / Ten Air (093A:EB01 receiver, 093A:E020 cable) ----
        // The C++ program substituted HidProduct at link time with "Ninjutso Ten Air"; the seam
        // gives the driver the same string, so the C++ name assertion is covered.
        let o = with_product("Ninjutso Ten Air", || {
            fx.poll(vec![ten_reply(0x13, 1), ten_reply(0x12, 67), ten_reply(0x11, 0)], vec![ten_coll(0xEB01)], true)
        });
        assert!(o.out.len() == 1 && o.is_claimed(0x093A, 0xEB01));
        assert!(o.out[0].percent == 67 && !o.out[0].charging && o.out[0].connected);
        assert!(o.out[0].name == "Ninjutso Ten Air" && o.out[0].kind == DeviceKind::Mouse);
        assert!(o.out[0].via == "2.4 GHz receiver" && o.out[0].key == "ninjutso-ten:EB01");
        assert!(o.writes.len() == 3 && o.writes[0][1] == 0x13 && o.writes[1][1] == 0x12 && o.writes[2][1] == 0x11);

        let o = fx.poll(vec![ten_reply(0x13, 0), ten_reply(0x12, 67), ten_reply(0x11, 0)], vec![ten_coll(0xEB01)], true);
        assert!(o.out.is_empty() && o.claimed.is_empty() && o.writes.len() == 1);
        let o = fx.poll(vec![ten_reply(0x13, 1), ten_reply(0x12, 101), ten_reply(0x11, 0)], vec![ten_coll(0xEB01)], true);
        assert!(o.out.is_empty() && o.claimed.is_empty());
        // A first, unusable frame is consumed by the retry loop.
        let o = fx.poll(vec![vec![0x06, 0], ten_reply(0x13, 1), ten_reply(0x12, 20), ten_reply(0x11, 1)], vec![ten_coll(0xEB01)], true);
        assert!(o.out.len() == 1 && o.out[0].charging && o.writes.len() == 3);

        for pct in [0u8, 100] {
            let o = fx.poll(vec![ten_reply(0x13, 1), ten_reply(0x12, pct), ten_reply(0x11, 1)], vec![ten_coll(0xE020)], true);
            assert!(o.out.len() == 1 && o.out[0].percent == pct as i32 && o.out[0].charging);
            assert!(o.out[0].via == "USB cable" && o.is_claimed(0x093A, 0xE020));
        }

        let mut ten_wrong_id = ten_reply(0x13, 1);
        ten_wrong_id[0] = 7;
        for bad in [Vec::new(), vec![0x06], ten_wrong_id, ten_reply(0x12, 1), vec![0u8; 17]] {
            let o = fx.poll(vec![bad.clone(), bad.clone(), bad.clone(), ten_reply(0x13, 1)], vec![ten_coll(0xEB01)], true);
            assert!(o.out.is_empty() && o.claimed.is_empty() && o.writes.len() == 1 && o.feature_reads == 3);
        }
        let o = fx.poll(Vec::new(), vec![ten_coll(0xEB01)], true);
        assert!(o.out.is_empty() && o.claimed.is_empty() && o.feature_reads == 3);
        fx.set_send_ok(false);
        let o = fx.poll(Vec::new(), vec![ten_coll(0xEB01)], true);
        assert!(o.out.is_empty() && o.feature_reads == 0 && o.writes.len() == 1);
        fx.set_send_ok(true);
        fx.set_open_ok(false);
        let o = fx.poll(Vec::new(), vec![ten_coll(0xEB01)], true);
        assert!(o.out.is_empty() && o.writes.is_empty());
        fx.set_open_ok(true);

        for variant in 0..7 {
            let mut c = ten_coll(0xEB01);
            match variant {
                0 => c.vid = 0x1234,
                1 => c.pid = 0xEA01,
                2 => c.caps.usage_page = 0xFF00,
                3 => c.caps.usage_page = 0xFF02,
                4 => c.caps.usage = 2,
                5 => c.caps.feature_report_byte_length = 64,
                6 => c.caps.feature_report_byte_length = 0,
                _ => unreachable!(),
            }
            let o = fx.poll(Vec::new(), vec![c], true);
            assert!(o.opens == 0 && o.writes.is_empty() && o.claimed.is_empty(), "variant {variant} must never be opened or queried");
        }

        // A Ten receiver claimed by an earlier poll is not probed again.
        fx.reset_opens();
        let mut f = TestFactory { sh: fx.sh.clone() };
        let mut ctx = PollContext::new(&mut f);
        ctx.colls = vec![ten_coll(0xEB01)];
        ctx.claim(0x093A, 0xEB01);
        poll_ninjutso(&mut ctx);
        assert_eq!(fx.opens(), 0);

        // Outside the seam the real helper cannot read a simulated collection, so the driver's own
        // fallback name is what a scripted poll reports (real behaviour, not the C++ stub).
        let o = fx.poll(vec![ten_reply(0x13, 1), ten_reply(0x12, 67), ten_reply(0x11, 0)], vec![ten_coll(0xEB01)], true);
        assert!(o.out.len() == 1 && o.out[0].name == "Ninjutso Ten / Ten Air");
    }

    #[test]
    fn ninjutso_cable() {
        let fx = Fixture::new();

        // ---- Sora V2 receiver (1915:AE1C) ----
        let o = fx.poll(vec![status(32)], vec![collection()], false);
        assert!(o.out.len() == 1 && o.is_claimed(0x1915, 0xAE1C));
        let s = &o.out[0];
        assert!(s.percent == 32 && s.connected && !s.charging);
        assert!(s.name == "Ninjutso Sora V2" && s.key == "ninjutso:1915:AE1C");
        assert!(s.kind == DeviceKind::Mouse && s.via == "2.4 GHz receiver");
        assert_eq!(o.queries, 1);
        let (out_len, before, after) = fx.repoll(&o, vec![collection()]);
        assert!(after == before && out_len == 1);

        let o = fx.poll(vec![status_of(0, true, true)], vec![collection()], false);
        assert!(o.out.len() == 1 && o.out[0].percent == 100 && o.out[0].charging);
        let o = fx.poll(vec![status_of(32, true, false), status(31)], vec![collection()], false);
        assert!(o.out.len() == 1 && o.out[0].percent == 31 && o.queries == 2);
        let o = fx.poll(vec![status_of(0, true, false); 4], vec![collection()], false);
        assert!(o.out.len() == 1 && !o.out[0].connected && !o.out[0].charging && o.out[0].percent == -1);
        assert_eq!(o.queries, 4);

        let mut wrong_id = status(32);
        let mut wrong_command = status(32);
        wrong_id[0] = 4;
        wrong_command[1] = 0x28;
        let o = fx.poll(vec![wrong_id, wrong_command, vec![0u8; 12], status(101)], vec![collection()], false);
        assert!(o.out.is_empty() && o.claimed.is_empty() && o.queries == 4);
        let o = fx.poll(Vec::new(), vec![collection()], false);
        assert!(o.out.is_empty() && o.claimed.is_empty() && o.queries == 4);
        fx.set_send_ok(false);
        let o = fx.poll(vec![status(32)], vec![collection()], false);
        assert!(o.out.is_empty() && o.queries == 1);
        fx.set_send_ok(true);

        let mut other_vendor = collection();
        let mut other_product = collection();
        let mut other_page = collection();
        let mut other_usage = collection();
        let mut short_report = collection();
        other_vendor.vid = 0x1234;
        other_product.pid = 0xAE8C; // 8K receiver is outside the verified scope
        other_page.caps.usage_page = 1;
        other_usage.caps.usage = 2;
        short_report.caps.feature_report_byte_length = 31;
        let before = fx.opens();
        let o = fx.poll(Vec::new(), vec![other_vendor, other_product, other_page, other_usage, short_report], false);
        assert!(o.opens == before && o.out.is_empty());

        // ---- USB cable (1915:AE11): the status byte [12] stays 0 there, so the mouse counts as
        // connected. Same fields as a reply captured from a Sora V2 on the cable:
        // 05 15 00 00 01 00 00 00 00 4C 01 00 00 ... ----
        let mut cable = collection();
        cable.pid = 0xAE11;
        let o = fx.poll(vec![status_of(0x4C, true, false)], vec![cable.clone()], false);
        assert!(o.out.len() == 1 && o.is_claimed(0x1915, 0xAE11) && o.queries == 1);
        assert!(o.out[0].connected && o.out[0].percent == 76 && o.out[0].charging);
        assert!(o.out[0].key == "ninjutso:1915:AE11" && o.out[0].via == "USB cable");
        assert!(o.out[0].name == "Ninjutso Sora V2" && o.out[0].kind == DeviceKind::Mouse);
        // Already claimed: not opened again.
        let (out_len, before, after) = fx.repoll(&o, vec![cable.clone()]);
        assert!(after == before && out_len == 1);

        // Receiver and cable plugged in together: one entry each, receiver first.
        let o = fx.poll(vec![status(40), status_of(41, true, false)], vec![collection(), cable.clone()], false);
        assert!(o.out.len() == 2 && o.queries == 2 && o.is_claimed(0x1915, 0xAE1C) && o.is_claimed(0x1915, 0xAE11));
        assert!(o.out[0].via == "2.4 GHz receiver" && o.out[0].percent == 40 && !o.out[0].charging);
        assert!(o.out[1].via == "USB cable" && o.out[1].percent == 41 && o.out[1].connected && o.out[1].charging);

        // A receiver claimed by an earlier poll does not stop the cable from being read.
        fx.prepare(vec![status_of(55, true, false)], false);
        let mut f = TestFactory { sh: fx.sh.clone() };
        let mut ctx = PollContext::new(&mut f);
        ctx.colls = vec![collection(), cable];
        ctx.claim(0x1915, 0xAE1C);
        poll_ninjutso(&mut ctx);
        assert!(ctx.out.len() == 1 && ctx.out[0].via == "USB cable" && ctx.out[0].percent == 55);
        assert_eq!(fx.queries(), 1);
    }
}
