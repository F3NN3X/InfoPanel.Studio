//! DAREU EM901X receiver (260D:1074), verified on hardware. Battery query from the official
//! EM901X AIM-WL driver v1.0 (GetPower / SendCommand); protocol analysis:
//! github.com/wushuai0802/myfinder-device-battery/blob/main/engine/upstream-protocols.md
//! Unlike the Kysona transport, Feature 08 is sent on FF02:0002 and Input 09 arrives on
//! the sibling FF01:0000 collection. Only command 04 is needed; no initialization/settings.
//! Reply: [09][04][status=0]...[6=percent][7=charging]. No reply checksum rule is established.

use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{hex4, HidIo, PollContext};
use crate::win::now_ms;

pub fn poll_dareu(ctx: &mut PollContext) {
    let (vid, pid) = (0x260Du16, 0x1074u16);
    if ctx.is_claimed(vid, pid) { return; }
    let inputs = ctx.find(vid, pid, |c| {
        c.iface == 1 && c.page() == 0xFF01 && c.usage() == 0 && c.in_len() == 17
    });
    let features = ctx.find(vid, pid, |c| {
        c.iface == 1 && c.page() == 0xFF02 && c.usage() == 2 && c.feat_len() == 17
    });
    // Do not pair arbitrary collections when multiple receivers are present.
    if inputs.len() != 1 || features.len() != 1 { return; }

    let Some(mut input) = ctx.open(&inputs[0]) else { return };
    let Some(mut feature) = ctx.open_feature_only(&features[0]) else { return };
    let mut req = vec![0u8; 17];
    let mut r: Vec<u8> = Vec::new();
    req[0] = 0x08;
    req[1] = 0x04;
    req[16] = 0x49;  // 0x55 minus the sum of bytes 0..15
    input.flush();
    if !feature.set_feature(&req) { return; }
    let end = now_ms() + 1000;
    for _reports in 0..32 {
        let left = (end as i64 - now_ms() as i64) as i32;
        if left <= 0 || input.read(&mut r, left as u32) < 0 { return; }
        if r.len() != 17 || r[0] != 0x09 || r[1] != 0x04 || r[2] != 0 || r[6] > 100 { continue; }
        let s = DeviceStatus {
            key: format!("dareu:{}:{}", hex4(vid), hex4(pid)),
            name: "DAREU EM901X".into(),
            kind: DeviceKind::Mouse,
            via: "2.4 GHz receiver".into(),
            percent: r[6] as i32,
            charging: r[7] != 0,
            ..Default::default()
        };
        ctx.add(s, vid, pid);
        return;
    }
}

#[cfg(test)]
mod tests {
    //! Port of tests/dareu_driver_test.cpp: exercise the real driver with a simulated transport;
    //! no hardware commands are sent.
    //!
    //! The C++ test fails Open (input) and OpenFeatureOnly (feature) independently and counts
    //! sends/reads separately, so it brings its own transport, like the C++ program did.
    use super::*;
    use crate::devices::DeviceStatus;
    use crate::hid::{HidCaps, HidColl, HidFactory, HidIo, PollContext};
    use crate::win::now_ms;
    use std::cell::RefCell;
    use std::collections::BTreeSet;
    use std::rc::Rc;
    use std::time::Duration;

    struct State {
        replies: Vec<Vec<u8>>,
        opens: u32,
        sends: u32,
        reads: u32,
        read_delay_ms: u64,
        open_ok: bool,
        feature_open_ok: bool,
        send_ok: bool,
    }

    /// C++ test globals, reset by its `Context()` helper.
    struct Cfg {
        replies: Vec<Vec<u8>>,
        read_delay_ms: u64,
        open_ok: bool,
        feature_open_ok: bool,
        send_ok: bool,
    }

    impl Default for Cfg {
        fn default() -> Self {
            Cfg { replies: Vec::new(), read_delay_ms: 0, open_ok: true, feature_open_ok: true, send_ok: true }
        }
    }

    struct Dev {
        sh: Rc<RefCell<State>>,
        path: String,
    }

    impl HidIo for Dev {
        fn write(&mut self, _data: &[u8], _timeout_ms: u32) -> bool { false }
        fn read(&mut self, buf: &mut Vec<u8>, timeout_ms: u32) -> i32 {
            assert_eq!(self.path, "input");
            {
                let sh = self.sh.borrow();
                assert_eq!(sh.sends, 1); // the feature command must have been sent first
            }
            assert!(timeout_ms > 0 && timeout_ms <= 1000);
            let delay = {
                let mut sh = self.sh.borrow_mut();
                sh.reads += 1;
                sh.read_delay_ms
            };
            if delay > 0 {
                std::thread::sleep(Duration::from_millis((timeout_ms as u64).min(delay)));
            }
            let mut sh = self.sh.borrow_mut();
            if sh.replies.is_empty() { return -1; }
            let r = sh.replies.remove(0);
            buf.clear();
            buf.extend_from_slice(&r);
            r.len() as i32
        }
        fn set_output_and_read(&mut self, _data: &[u8], _buf: &mut Vec<u8>, _timeout_ms: u32) -> i32 { -1 }
        fn flush(&mut self) { assert_eq!(self.path, "input"); }
        fn set_feature(&mut self, data: &[u8]) -> bool {
            assert_eq!(self.path, "feature");
            let mut expected = vec![0u8; 17];
            expected[0] = 0x08;
            expected[1] = 0x04;
            expected[16] = 0x49; // 0x55 minus the sum of bytes 0..15
            assert_eq!(data, expected.as_slice());
            let mut sh = self.sh.borrow_mut();
            sh.sends += 1;
            sh.send_ok
        }
        fn get_feature(&mut self, _id: u8, _out: &mut Vec<u8>) -> bool { false }
        fn get_input_report(&mut self, _id: u8, _out: &mut Vec<u8>) -> bool { false }
    }

    struct Factory {
        sh: Rc<RefCell<State>>,
    }

    impl Factory {
        fn opens(&self) -> u32 { self.sh.borrow().opens }
        fn sends(&self) -> u32 { self.sh.borrow().sends }
        fn reads(&self) -> u32 { self.sh.borrow().reads }
    }

    impl HidFactory for Factory {
        fn open(&mut self, coll: &HidColl) -> Option<Box<dyn HidIo>> {
            assert_eq!(coll.path, "input");
            let ok = {
                let mut sh = self.sh.borrow_mut();
                sh.opens += 1;
                sh.open_ok
            };
            if !ok { return None; }
            Some(Box::new(Dev { sh: self.sh.clone(), path: coll.path.clone() }))
        }
        fn open_read_only(&mut self, coll: &HidColl) -> Option<Box<dyn HidIo>> { self.open(coll) }
        fn open_feature_only(&mut self, coll: &HidColl) -> Option<Box<dyn HidIo>> {
            assert_eq!(coll.path, "feature");
            let ok = {
                let mut sh = self.sh.borrow_mut();
                sh.opens += 1;
                sh.feature_open_ok
            };
            if !ok { return None; }
            Some(Box::new(Dev { sh: self.sh.clone(), path: coll.path.clone() }))
        }
    }

    fn collection(input: bool) -> HidColl {
        HidColl {
            vid: 0x260D,
            pid: 0x1074,
            iface: 1,
            path: if input { "input" } else { "feature" }.into(),
            caps: HidCaps {
                usage_page: if input { 0xFF01 } else { 0xFF02 },
                usage: if input { 0 } else { 2 },
                input_report_byte_length: if input { 17 } else { 0 },
                feature_report_byte_length: if input { 0 } else { 17 },
                ..Default::default()
            },
            ..Default::default()
        }
    }

    fn reply(percent: u8, charging: u8) -> Vec<u8> {
        vec![0x09, 0x04, 0, 0, 0, 2, percent, charging, 0, 0, 0, 0, 0, 0, 0, 0, 0xF1]
    }

    fn run(colls: Vec<HidColl>, cfg: Cfg) -> (Factory, Vec<DeviceStatus>, BTreeSet<(u16, u16)>) {
        let state = State {
            replies: cfg.replies,
            opens: 0,
            sends: 0,
            reads: 0,
            read_delay_ms: cfg.read_delay_ms,
            open_ok: cfg.open_ok,
            feature_open_ok: cfg.feature_open_ok,
            send_ok: cfg.send_ok,
        };
        let sh = Rc::new(RefCell::new(state));
        let mut f = Factory { sh };
        let (out, claimed) = {
            let mut ctx = PollContext::new(&mut f);
            ctx.colls = colls;
            poll_dareu(&mut ctx);
            (ctx.out, ctx.claimed)
        };
        (f, out, claimed)
    }

    #[test]
    fn dareu_driver_test() {
        let colls = || vec![collection(true), collection(false)];

        let (mut io, out, claimed) = run(colls(), Cfg { replies: vec![reply(85, 0)], ..Default::default() });
        assert_eq!(out.len(), 1);
        assert!(claimed.contains(&(0x260D, 0x1074)));
        let s = &out[0];
        assert_eq!(s.name, "DAREU EM901X");
        assert_eq!(s.key, "dareu:260D:1074");
        assert_eq!(s.kind, DeviceKind::Mouse);
        assert_eq!(s.via, "2.4 GHz receiver");
        assert_eq!(s.percent, 85);
        assert!(!s.charging);
        assert!(s.connected);
        assert!(!s.asleep);
        assert_eq!(io.opens(), 2);
        assert_eq!(io.sends(), 1);
        assert_eq!(io.reads(), 1);
        // A second poll on the same context does not query a claimed device again.
        {
            let mut ctx = PollContext::new(&mut io);
            ctx.colls = colls();
            for &(vid, pid) in &claimed { ctx.claim(vid, pid); }
            poll_dareu(&mut ctx);
        }
        assert_eq!(io.sends(), 1); // already claimed

        for percent in [0u8, 100] {
            let (_io, out, _) = run(colls(), Cfg { replies: vec![reply(percent, 2)], ..Default::default() });
            assert_eq!(out.len(), 1);
            assert_eq!(out[0].percent, percent as i32);
            assert!(out[0].charging);
        }

        // Ignore unrelated, truncated, failed and out-of-range reports before a valid reply.
        let mut wrong_id = reply(85, 0);
        wrong_id[0] = 8;
        let mut wrong_command = reply(85, 0);
        wrong_command[1] = 3;
        let mut failed = reply(85, 0);
        failed[2] = 1;
        let mut short_reply = reply(85, 0);
        short_reply.resize(7, 0);
        let mut long_reply = reply(85, 0);
        long_reply.push(0);
        let (io, out, _) = run(colls(), Cfg {
            replies: vec![
                wrong_id.clone(), wrong_command.clone(), failed.clone(), short_reply, long_reply,
                reply(101, 0), reply(42, 1),
            ],
            ..Default::default()
        });
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].percent, 42);
        assert!(out[0].charging);
        assert_eq!(io.sends(), 1);
        assert_eq!(io.reads(), 7);

        let (io, out, claimed) = run(colls(), Cfg {
            replies: vec![wrong_id.clone(), failed.clone(), reply(255, 0)],
            ..Default::default()
        });
        assert!(out.is_empty());
        assert!(claimed.is_empty());
        assert_eq!(io.sends(), 1);

        let (io, out, _) = run(colls(), Cfg { replies: vec![wrong_command.clone(); 33], ..Default::default() });
        assert!(out.is_empty());
        assert_eq!(io.reads(), 32); // bounded even under constant traffic
        assert_eq!(io.sends(), 1);

        let started = now_ms();
        let (io, out, claimed) = run(colls(), Cfg {
            replies: vec![wrong_command.clone(); 32],
            read_delay_ms: 80,
            ..Default::default()
        });
        let elapsed = now_ms() - started;
        assert!(out.is_empty());
        assert!(claimed.is_empty());
        assert_eq!(io.sends(), 1);
        assert!(io.reads() < 32);
        assert!(
            elapsed >= 900 && elapsed < 1500,
            "unrelated reports must not restart the one-second deadline (elapsed {elapsed} ms)"
        );

        let (io, out, claimed) = run(colls(), Cfg::default());
        assert!(out.is_empty());
        assert!(claimed.is_empty());
        assert_eq!(io.sends(), 1); // silence is not 0%

        let (io, out, _) = run(colls(), Cfg { send_ok: false, ..Default::default() });
        assert!(out.is_empty());
        assert_eq!(io.sends(), 1);
        assert_eq!(io.reads(), 0);

        let (io, out, _) = run(colls(), Cfg { open_ok: false, ..Default::default() });
        assert!(out.is_empty());
        assert_eq!(io.sends(), 0);

        let (io, out, _) = run(colls(), Cfg { feature_open_ok: false, ..Default::default() });
        assert!(out.is_empty());
        assert_eq!(io.opens(), 2);
        assert_eq!(io.sends(), 0);
        assert_eq!(io.reads(), 0);

        for invalid in 0..10 {
            let mut c = colls();
            match invalid {
                0 => c[0].pid = 0x1090,
                1 => c[1].vid = 0x3554,
                2 => c[0].caps.usage_page = 0xFF03,
                3 => c[1].caps.usage = 0,
                4 => c[0].caps.input_report_byte_length = 8,
                5 => c[1].caps.feature_report_byte_length = 65,
                6 => c[0].iface = 2,
                7 => { let extra = c[0].clone(); c.push(extra); }
                8 => { let extra = c[1].clone(); c.push(extra); }
                _ => { c.pop(); }
            }
            let (io, out, claimed) = run(c, Cfg::default());
            assert!(out.is_empty());
            assert!(claimed.is_empty());
            assert_eq!(io.opens(), 0);
            assert_eq!(io.sends(), 0);
        }
    }
}
