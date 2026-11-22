//! Machenike L7 Arctic / L7 Mix. Read-state protocol from the official L7 Mix
//! app 1.0.0.8 (DeviceDriver.exe), verified on an L7 Arctic over receiver and cable.
//! See docs/machenike.md for attribution, captured replies and field semantics.
//! Feature report 51, command 06, 21 bytes: [10] mode/link, [11] %, [12] charging.

use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{HidColl, HidIo, PollContext, hid_product};
use crate::win::{now_ms, sleep_ms};

const VENDOR: u16 = 0x248A;
const RECEIVER: u16 = 0xFF4C;
const CABLE: u16 = 0xFF4E;
const STATUS_LENGTH: u16 = 21;

fn is_status_collection(c: &HidColl, cable: bool) -> bool {
    c.iface == (if cable { 2 } else { 1 })
        && c.page() == 0x008C
        && c.usage() == 1
        && c.in_len() == 33
        && c.out_len() == 33
        && c.feat_len() == 1001
}

fn decode_status(r: &[u8], cable: bool, s: &mut DeviceStatus) -> bool {
    if r.len() != STATUS_LENGTH as usize
        || r[0] != 0x51
        || r[1] != 0x06
        || r[4] != 0x8A
        || r[5] != 0x24
        || r[6] != 0x4E
        || r[7] != 0xFF
        || (r[10] & 7) != (if cable { 0 } else { 1 })
    {
        return false;
    }
    // The wireless link bit is clear on the cable too; the USB connection itself is authoritative there.
    let connected = cable || (r[10] & 8) != 0;
    if connected && (r[11] > 100 || r[12] > 1) {
        return false;
    }
    s.connected = connected;
    s.percent = if connected { r[11] as i32 } else { -1 }; // 0% is valid, not an offline sentinel
    s.charging = connected && r[12] == 1;
    true
}

fn query_status(d: &mut dyn HidIo, cable: bool, s: &mut DeviceStatus) -> bool {
    let mut request = vec![0u8; STATUS_LENGTH as usize];
    request[0] = 0x51;
    request[1] = 0x06;
    let deadline = now_ms() + 200;
    if !d.set_feature(&request) {
        return false;
    }
    // Allow the reply to replace the receiver's previous feature response. An open vendor app
    // can leave unrelated replies here, so accept only this command's validated status frame.
    loop {
        sleep_ms(10);
        let mut r = Vec::new();
        if d.get_feature(0x51, &mut r) && decode_status(&r, cable, s) {
            return true;
        }
        if now_ms() >= deadline {
            break;
        }
    }
    false
}

pub fn poll_machenike(ctx: &mut PollContext) {
    let mut have_cable = false;
    // A live cable reading takes precedence over the dongle's cached/disconnected mouse state.
    for &pid in &[CABLE, RECEIVER] {
        if ctx.is_claimed(VENDOR, pid) {
            continue;
        }
        let cable = pid == CABLE;
        for c in ctx.find(VENDOR, pid, |c| is_status_collection(c, cable)) {
            if hid_product(&c) != "L7 Mix" {
                continue;
            }
            // Reserve even on I/O failure: the later Ajazz poller shares VID 248A and would
            // otherwise send its different command to the L7's cable collection.
            ctx.claim(VENDOR, pid);
            if have_cable {
                break;
            }
            let mut status = c.clone();
            // 1001 is the largest report on this collection (macro data). Report 51 is 21 bytes;
            // use its exact length in the common HID layer, as the official application does.
            status.caps.feature_report_byte_length = STATUS_LENGTH;
            let Some(mut d) = ctx.open_feature_only(&status) else { break };
            let mut s = DeviceStatus::default();
            if !query_status(&mut *d, cable, &mut s) {
                break;
            }
            s.key = "machenike:l7".into(); // keep the same tray entry when switching cable/receiver
            s.name = "Machenike L7 Arctic / L7 Mix".into();
            s.kind = DeviceKind::Mouse;
            s.via = if cable { "USB cable".into() } else { "2.4 GHz receiver".into() };
            s.grace_sec = if cable { 0 } else { 1800 };
            have_cable = cable;
            ctx.add(s, VENDOR, pid);
            break; // one exact status collection and one bounded query per product
        }
    }
}

#[cfg(test)]
mod tests {
    //! Ported from tests/machenike_driver_test.cpp (fixtures captured from an L7 Arctic).
    //!
    //! The C++ program substituted `HidProduct` at link time (`std::wstring HidProduct(...) {
    //! return product; }`) to drive the `"L7 Mix"` gate. `test_seam::with_product` does the same
    //! job here, so the poll-level assertions all run — including the `"Unrelated mouse"`
    //! negative case, the cable/receiver precedence, the claim-on-I/O-failure reservation and the
    //! dedup between polls. The bespoke transport reproduces the C++ mock exactly: it validates
    //! the 21-byte status request, the feature report id and the opened collection's 21-byte
    //! report length, and it counts opens/sends/reads the way the C++ globals did.
    use super::*;
    use crate::hid::test_seam::with_product;
    use crate::hid::{HidCaps, HidFactory};
    use std::cell::RefCell;
    use std::collections::{BTreeSet, VecDeque};
    use std::rc::Rc;

    /// Captured from an L7 Arctic over the 2.4 GHz receiver: 64 %, not charging.
    fn wireless() -> Vec<u8> {
        vec![0x51, 0x06, 0x01, 0x00, 0x8A, 0x24, 0x4E, 0xFF, 0x05, 0x01, 0x09, 0x40, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    }
    /// Captured on the cable: 74 %, charging, no wireless connected bit.
    fn cable_reply() -> Vec<u8> {
        vec![0x51, 0x06, 0x01, 0x00, 0x8A, 0x24, 0x4E, 0xFF, 0x05, 0x01, 0x00, 0x4A, 0x01, 0, 0, 0, 0, 0, 0, 0, 0]
    }
    /// Receiver remains present while the mouse uses its cable: cached percentage is not live.
    fn offline() -> Vec<u8> {
        vec![0x51, 0x06, 0x01, 0x00, 0x8A, 0x24, 0x4E, 0xFF, 0x05, 0x01, 0x01, 0x40, 0x01, 0, 0, 0, 0, 0, 0, 0, 0]
    }

    fn collection(cable: bool) -> HidColl {
        HidColl {
            vid: 0x248A,
            pid: if cable { 0xFF4E } else { 0xFF4C },
            iface: if cable { 2 } else { 1 },
            path: if cable { "cable" } else { "receiver" }.into(),
            caps: HidCaps {
                usage_page: 0x008C,
                usage: 1,
                input_report_byte_length: 33,
                output_report_byte_length: 33,
                feature_report_byte_length: 1001,
            },
            ..Default::default()
        }
    }

    /// The C++ test globals: `replies`, `openOk`, `sendOk`, `repeatReply`, `opens`, `sends`,
    /// `reads`.
    #[derive(Default)]
    struct State {
        replies: VecDeque<Vec<u8>>,
        repeat: bool,
        open_ok: bool,
        send_ok: bool,
        opens: u32,
        sends: u32,
        reads: u32,
    }

    /// The C++ mock's `HidDev`: it sees the collection the driver opened, which is how the
    /// `featLen() == 21` assertions are made.
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
            // C++ SetFeature: only the documented 21-byte status query, on the 21-byte open.
            let mut expected = vec![0u8; STATUS_LENGTH as usize];
            expected[0] = 0x51;
            expected[1] = 0x06;
            assert_eq!(self.coll.caps.feature_report_byte_length, STATUS_LENGTH, "the status must be opened with its exact 21-byte report");
            assert_eq!(data, &expected[..], "only the documented status query can be sent");
            let mut sh = self.sh.borrow_mut();
            sh.sends += 1;
            sh.send_ok
        }

        fn get_feature(&mut self, report_id: u8, out: &mut Vec<u8>) -> bool {
            // C++ GetFeature: report 51 on the 21-byte open.
            assert_eq!(self.coll.caps.feature_report_byte_length, STATUS_LENGTH);
            assert_eq!(report_id, 0x51);
            let mut sh = self.sh.borrow_mut();
            sh.reads += 1;
            let r = if sh.repeat { sh.replies.front().cloned() } else { sh.replies.pop_front() };
            match r {
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
            // C++ OpenFeatureOnly: count the open, then assert the driver narrowed the report —
            // 1001 is the collection's largest report, 21 is the status report.
            let mut sh = self.sh.borrow_mut();
            sh.opens += 1;
            assert_eq!(coll.caps.feature_report_byte_length, STATUS_LENGTH, "status report must be opened with its exact 21-byte length");
            if !sh.open_ok {
                return None;
            }
            Some(Box::new(TestIo { sh: self.sh.clone(), coll: coll.clone() }))
        }
    }

    /// What one C++ `PollMachenike(...)` leaves behind.
    struct Outcome {
        out: Vec<DeviceStatus>,
        claimed: BTreeSet<(u16, u16)>,
        opens: u32,
        sends: u32,
        reads: u32,
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
            // openOk = sendOk = true, as in the C++ `Context()`.
            Fixture { sh: Rc::new(RefCell::new(State { open_ok: true, send_ok: true, ..Default::default() })) }
        }

        /// The C++ `Context()` defaults: fresh counters, transport OK, no scripted reply.
        fn context(&self) {
            let mut sh = self.sh.borrow_mut();
            sh.replies.clear();
            sh.repeat = false;
            sh.open_ok = true;
            sh.send_ok = true;
            sh.opens = 0;
            sh.sends = 0;
            sh.reads = 0;
        }

        fn set_replies(&self, replies: Vec<Vec<u8>>) {
            self.sh.borrow_mut().replies = replies.into();
        }
        fn set_repeat(&self, repeat: bool) {
            self.sh.borrow_mut().repeat = repeat;
        }
        fn set_open_ok(&self, ok: bool) {
            self.sh.borrow_mut().open_ok = ok;
        }
        fn set_send_ok(&self, ok: bool) {
            self.sh.borrow_mut().send_ok = ok;
        }

        /// One C++ `PollMachenike(ctx)` over `colls`, with the mock state read while the poll is
        /// done (the C++ globals lived outside the context).
        fn run(&self, colls: Vec<HidColl>) -> Outcome {
            let mut f = TestFactory { sh: self.sh.clone() };
            let mut ctx = PollContext::new(&mut f);
            ctx.colls = colls;
            poll_machenike(&mut ctx);
            let sh = self.sh.borrow();
            Outcome { out: ctx.out, claimed: ctx.claimed, opens: sh.opens, sends: sh.sends, reads: sh.reads }
        }

        /// The C++ "poll again on the same context" step in `Connected()`: the context still holds
        /// what the first poll listed and claimed. Returns
        /// (out.len() after the second poll, opens before, opens after).
        fn repoll(&self, first: &Outcome, colls: Vec<HidColl>) -> (usize, u32, u32) {
            let before = self.sh.borrow().opens;
            let mut f = TestFactory { sh: self.sh.clone() };
            let mut ctx = PollContext::new(&mut f);
            ctx.colls = colls;
            ctx.claimed = first.claimed.clone();
            ctx.out = first.out.clone();
            poll_machenike(&mut ctx);
            (ctx.out.len(), before, self.sh.borrow().opens)
        }
    }

    /// The C++ `Connected(...)` block: one reply, the exact state, then a second poll on the same
    /// context that must neither open the device again nor list it twice.
    fn connected(fx: &Fixture, reply: Vec<u8>, percent: i32, cable: bool, charging: bool) {
        fx.context();
        fx.set_replies(vec![reply]);
        let o = fx.run(vec![collection(cable)]);
        assert_eq!(o.out.len(), 1);
        assert!(o.is_claimed(VENDOR, if cable { CABLE } else { RECEIVER }));
        assert!(o.opens == 1 && o.sends == 1);
        if o.out.len() == 1 {
            let s = &o.out[0];
            assert!(s.percent == percent && s.charging == charging && s.connected && !s.asleep);
            assert!(s.kind == DeviceKind::Mouse);
            assert!(s.name == "Machenike L7 Arctic / L7 Mix");
            assert!(s.via == if cable { "USB cable" } else { "2.4 GHz receiver" });
            let (out_len, before, after) = fx.repoll(&o, vec![collection(cable)]);
            assert!(after == before && out_len == 1);
        }
    }

    fn decode(r: &[u8], cable: bool) -> Option<DeviceStatus> {
        let mut s = DeviceStatus::default();
        if decode_status(r, cable, &mut s) { Some(s) } else { None }
    }

    #[test]
    fn machenike_driver() {
        // The C++ `product` global is "L7 Mix" for every block but the negative one.
        with_product("L7 Mix", || {
            let fx = Fixture::new();

            // ---- captured wireless 64 % ----
            connected(&fx, wireless(), 64, false, false);
            // ---- captured cable 74 %, charging, no wireless connected bit ----
            connected(&fx, cable_reply(), 74, true, true);
            // ---- valid zero and full are percentages ----
            for pct in [0u8, 100] {
                let mut r = wireless();
                r[11] = pct;
                connected(&fx, r, pct as i32, false, false);
            }

            // ---- offline receiver must not show cached 64 % or charging ----
            fx.context();
            fx.set_replies(vec![offline()]);
            let o = fx.run(vec![collection(false)]);
            assert_eq!(o.out.len(), 1);
            if o.out.len() == 1 {
                assert!(!o.out[0].connected && o.out[0].percent == -1 && !o.out[0].charging);
            }

            // ---- cable wins, receiver suppressed, stable identity ----
            fx.context();
            fx.set_replies(vec![cable_reply()]);
            let o = fx.run(vec![collection(true), collection(false)]);
            assert!(o.out.len() == 1 && o.sends == 1 && o.is_claimed(VENDOR, RECEIVER));
            // The suppressed receiver is still reserved so the later Ajazz poller leaves it alone.
            assert!(o.is_claimed(VENDOR, CABLE));
            let cable_key = if o.out.is_empty() { String::new() } else { o.out[0].key.clone() };
            fx.context();
            fx.set_replies(vec![wireless()]);
            let o = fx.run(vec![collection(false)]);
            if o.out.len() == 1 {
                assert_eq!(o.out[0].key, cable_key);
            }

            // ---- strict identity and collection, no device commands ----
            for field in 0..8 {
                fx.context();
                let mut c = collection(false);
                match field {
                    0 => c.vid = 0x249A,
                    1 => c.pid = 0xFF4D,
                    2 => c.iface = 2,
                    3 => c.caps.usage_page = 0xFF00,
                    4 => c.caps.usage = 2,
                    5 => c.caps.input_report_byte_length = 32,
                    6 => c.caps.output_report_byte_length = 32,
                    7 => c.caps.feature_report_byte_length = 1000,
                    _ => unreachable!(),
                }
                fx.set_replies(vec![wireless()]);
                let o = fx.run(vec![c]);
                assert!(
                    o.out.is_empty() && o.claimed.is_empty() && o.opens == 0 && o.sends == 0,
                    "field {field} must be rejected without touching the device"
                );
            }

            // ---- a non-"L7 Mix" product lists, claims and opens nothing ----
            fx.context();
            let o = with_product("Unrelated mouse", || fx.run(vec![collection(false)]));
            assert!(o.out.is_empty() && o.opens == 0 && o.claimed.is_empty() && o.sends == 0);

            // ---- malformed replies skipped before the valid status ----
            let mut wrong_report = wireless();
            let mut wrong_command = wireless();
            let mut wrong_device = wireless();
            let mut wrong_mode = wireless();
            let mut bad_percent = wireless();
            let mut bad_charge = wireless();
            wrong_report[0] = 0x52;
            wrong_command[1] = 4;
            wrong_device[6] = 0x4D;
            wrong_mode[10] = 0x0F;
            bad_percent[11] = 101;
            bad_charge[12] = 0xFF;
            fx.context();
            fx.set_replies(vec![
                wrong_report.clone(),
                wrong_command.clone(),
                wrong_device.clone(),
                wrong_mode.clone(),
                bad_percent.clone(),
                bad_charge.clone(),
                vec![0u8; 12],
                wireless(),
            ]);
            let o = fx.run(vec![collection(false)]);
            assert!(o.out.len() == 1 && o.reads >= 8);
            if o.out.len() == 1 {
                assert_eq!(o.out[0].percent, 64);
            }
            // One bounded query, matching the single SetFeature the C++ mock counted.
            assert_eq!(o.sends, 1);

            // ---- wrong cable collection rejected ----
            fx.context();
            let mut wrong_cable = collection(true);
            wrong_cable.iface = 1;
            let o = fx.run(vec![wrong_cable.clone()]);
            assert!(o.opens == 0 && o.claimed.is_empty());

            // ---- known mouse reserved after transport failure, no Ajazz probing ----
            fx.context();
            fx.set_open_ok(false);
            let o = fx.run(vec![collection(false)]);
            assert!(o.out.is_empty() && o.sends == 0 && o.is_claimed(VENDOR, RECEIVER));

            fx.context();
            fx.set_send_ok(false);
            let o = fx.run(vec![collection(false)]);
            assert!(o.out.is_empty() && o.sends == 1 && o.reads == 0 && o.is_claimed(VENDOR, RECEIVER));

            // ---- missing or continuously unrelated reply has a bounded deadline ----
            for unrelated in [false, true] {
                fx.context();
                if unrelated {
                    let mut repeated = wireless();
                    repeated[1] = 4;
                    fx.set_replies(vec![repeated]);
                    fx.set_repeat(true);
                }
                let start = now_ms();
                let o = fx.run(vec![collection(false)]);
                assert!(now_ms() - start < 800, "deadline must stay bounded");
                assert!(o.out.is_empty() && o.sends == 1 && o.is_claimed(VENDOR, RECEIVER));
                if unrelated {
                    assert!(o.reads > 1, "the repeated unrelated reply must be re-read");
                }
            }

            // ---- extra: the predicates themselves, frame by frame ----
            // The malformed sequence above proves these frames are skipped as a group; these
            // per-frame checks point at the exact condition. `wrong_cable_mode` and the cross-mode
            // pair are extra coverage the C++ program did not assert.
            let mut wrong_cable_mode = cable_reply();
            wrong_cable_mode[10] = 0x09; // the wireless link mode on the cable collection
            for bad in [&wrong_report, &wrong_command, &wrong_device, &wrong_mode, &bad_percent, &bad_charge] {
                assert!(decode(bad, false).is_none(), "malformed frame {bad:02X?} must be rejected");
            }
            assert!(decode(&wrong_cable_mode, true).is_none());
            assert!(decode(&cable_reply(), false).is_none());
            assert!(decode(&vec![0u8; 12], false).is_none());

            assert!(is_status_collection(&collection(false), false));
            assert!(is_status_collection(&collection(true), true));
            // Vendor/product id are not part of the predicate: `ctx.find` matches those in the
            // poll, which the strict-identity loop above covers end to end.
            assert!(!is_status_collection(&wrong_cable, true));
            for field in 2..8 {
                let mut c = collection(false);
                match field {
                    2 => c.iface = 2,
                    3 => c.caps.usage_page = 0xFF00,
                    4 => c.caps.usage = 2,
                    5 => c.caps.input_report_byte_length = 32,
                    6 => c.caps.output_report_byte_length = 32,
                    7 => c.caps.feature_report_byte_length = 1000,
                    _ => unreachable!(),
                }
                assert!(!is_status_collection(&c, false), "field {field} must reject the collection");
            }
        });
    }
}
