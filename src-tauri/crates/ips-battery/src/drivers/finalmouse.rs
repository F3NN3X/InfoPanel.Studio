//! Finalmouse UltralightX (ULX) and Starlight X (SLX) on their 2.4 GHz dongles (VID 361D).
//! Protocol from xpanel, Finalmouse's web configurator, as ported by:
//!  * OpenMouse mouse-protocol (src/finalmouse/index.ts, src/drivers/finalmouse/hid.ts):
//!    https://github.com/OpenMouse-Project/mouse-protocol
//!  * FinalmousePollingRateSwitcher (shared/FinalmouseHid.cs, used with a ULX dongle):
//!    https://github.com/xBambooz/FinalmousePollingRateSwitcher
//!
//! Frames on the vendor collection (usage page FF00), zero-padded to the report length:
//!   [report id][inner length = 2 + n][0x80 | command][n][n payload bytes]
//! A write with an empty payload is a GET; replies come back as input reports with the plain
//! command.
//!  * ULX dongle 0100 (FF00:0001): output report 04, replies on input report 05.
//!  * SLX dongles 0300 / 0301 (FF00, usage not pinned down): output report 01, replies on input 02.
//!    OpenMouse inferred these report ids from xpanel; battery readings through them are confirmed
//!    on Starlight X hardware, as on the UltralightX.
//! Only GETs are sent: the read xpanel starts with (ULX lift-off 21, SLX profile roster 57), then
//! wake/all (96), which makes the dongle push its status burst. From that burst:
//!  * 5:  battery voltage, mV u16 LE, mapped with xpanel's calibration curve
//!  * 38: state of charge [percent][mV u16 LE] (preferred when present)
//!  * 37: charging state (1 = charging)
//!  * 36: link state (0 = no link to the mouse; xpanel clears the RSSI then)
//! The mouse on its own cable (361D:0102, 0310, 0311) is not covered: its report ids are not known.
use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{HidIo, PollContext, hex4};
use crate::win::now_ms;

const K_VID: u16 = 0x361D;
const K_VOLTAGE: u8 = 5;
const K_LINK: u8 = 36;
const K_CHARGING: u8 = 37;
const K_STATE_OF_CHARGE: u8 = 38;
const K_WAKE_ALL: u8 = 96;

struct Model {
    pid: u16,
    name: &'static str,
    slx: bool,
    out_id: u8, // vendor output / input report ids
    in_id: u8,
    first_get: u8, // the read xpanel sends before wake/all
}
const K_MODELS: [Model; 3] = [
    Model { pid: 0x0100, name: "Finalmouse UltralightX", slx: false, out_id: 0x04, in_id: 0x05, first_get: 21 },
    Model { pid: 0x0300, name: "Finalmouse Starlight X", slx: true, out_id: 0x01, in_id: 0x02, first_get: 57 },
    Model { pid: 0x0301, name: "Finalmouse Starlight X", slx: true, out_id: 0x01, in_id: 0x02, first_get: 57 },
];

// xpanel's voltage curve: linear between the calibration points, rounded to the nearest percent.
fn percent_from_millivolts(mv: i32) -> i32 {
    const K_MV: [i32; 7] = [3000, 3620, 3660, 3740, 3880, 4170, 4380];
    const K_PCT: [f64; 7] = [0.2, 5.0, 10.0, 25.0, 50.0, 75.0, 100.0];
    if mv <= K_MV[0] {
        return 0;
    }
    for i in 1..K_MV.len() {
        if mv > K_MV[i] {
            continue;
        }
        let f = (mv - K_MV[i - 1]) as f64 / (K_MV[i] - K_MV[i - 1]) as f64;
        return (K_PCT[i - 1] + (K_PCT[i] - K_PCT[i - 1]) * f + 0.5).floor() as i32;
    }
    100
}

struct Status {
    soc: i32,      // state of charge, percent
    mv: i32,       // battery voltage
    charging: i32, // -1 = not reported
    link: i32,
}

fn valid_millivolts(mv: i32) -> bool {
    mv > 0 && mv < 5000
}

fn decode(r: &[u8], in_id: u8, st: &mut Status) {
    if r.len() < 4 || r[0] != in_id {
        return;
    }
    let inner = (r[1] as usize).min(r.len() - 2);
    if inner < 2 {
        return;
    }
    let n = (r[3] as usize).min(inner - 2);
    let p = &r[4..];
    match r[2] {
        K_VOLTAGE => {
            if n >= 2 {
                let mv = p[0] as i32 | ((p[1] as i32) << 8);
                if valid_millivolts(mv) {
                    st.mv = mv;
                }
            }
        }
        K_STATE_OF_CHARGE => {
            if n >= 3 && p[0] <= 100 {
                st.soc = p[0] as i32;
                let mv = p[1] as i32 | ((p[2] as i32) << 8);
                if valid_millivolts(mv) {
                    st.mv = mv;
                }
            }
        }
        K_CHARGING => {
            if n >= 1 {
                st.charging = p[0] as i32;
            }
        }
        K_LINK => {
            if n >= 1 {
                st.link = p[0] as i32;
            }
        }
        _ => {}
    }
}

fn get(d: &mut dyn HidIo, report_id: u8, command: u8) -> bool {
    d.write(&[report_id, 2, 0x80 | command, 0], 500)
}

fn query(d: &mut dyn HidIo, m: &Model, st: &mut Status) -> bool {
    if !get(d, m.out_id, m.first_get) || !get(d, m.out_id, K_WAKE_ALL) {
        return false;
    }
    // xpanel waits up to 1 s for the burst. Once the level is in, the charging state normally
    // follows within the same burst, so only wait briefly for it. The SLX's own percentage (38) is
    // preferred over its voltage, so keep waiting for it there.
    let mut end = now_ms() + 1000;
    let mut shortened = false;
    loop {
        let level = st.soc >= 0 || (!m.slx && st.mv > 0);
        if level && st.charging >= 0 {
            break;
        }
        if level && !shortened {
            end = end.min(now_ms() + 150);
            shortened = true;
        }
        let left = (end as i64 - now_ms() as i64) as i32;
        let mut r = Vec::new();
        if left <= 0 || d.read(&mut r, left as u32) < 0 {
            break;
        }
        decode(&r, m.in_id, st);
    }
    true
}

pub fn poll_finalmouse(ctx: &mut PollContext) {
    for m in &K_MODELS {
        if ctx.is_claimed(K_VID, m.pid) {
            continue;
        }
        let mut colls = ctx.find(K_VID, m.pid, |c| c.page() == 0xFF00 && (m.slx || c.usage() == 1) && c.in_len() >= 4 && c.out_len() >= 4);
        // The SLX vendor usage is not known; try usage 1 (the ULX one) first (stable sort).
        colls.sort_by_key(|c| c.usage() != 1);
        for c in colls {
            let Some(mut d) = ctx.open(&c) else { continue };
            let mut st = Status { soc: -1, mv: 0, charging: -1, link: -1 };
            if !query(&mut *d, m, &mut st) {
                continue;
            }
            let mut s = DeviceStatus {
                millivolts: st.mv,
                charging: st.charging == 1,
                key: format!("finalmouse:{}", hex4(m.pid)),
                name: m.name.into(),
                kind: DeviceKind::Mouse,
                via: "2.4 GHz receiver".into(),
                grace_sec: 1800,
                ..Default::default()
            };
            if st.soc >= 0 {
                s.percent = st.soc;
            } else if st.mv > 0 {
                s.percent = percent_from_millivolts(st.mv);
            } else if st.link == 0 {
                s.asleep = true; // the dongle answered, the mouse is asleep or off: keep the last value
            } else {
                continue; // no answer: the UI keeps the last reading dimmed during the grace period
            }
            ctx.add(s, K_VID, m.pid);
            break;
        }
    }
}

#[cfg(test)]
mod tests {
    //! Port of tests/finalmouse_driver_test.cpp: exercise the driver with a simulated HID
    //! transport; no hardware access.
    //!
    //! The C++ test's mock keys its scripted bursts by collection path and queues them when the
    //! wake/all GET is written, so it needs a bespoke mock here: the shared mock's script is keyed
    //! by the first two request bytes (which are the report id and the inner length for this
    //! protocol) and its reads are shared by every device.
    use super::*;
    use crate::devices::DeviceStatus;
    use crate::hid::{HidCaps, HidColl, HidFactory, HidIo, PollContext};
    use std::cell::RefCell;
    use std::collections::{BTreeSet, HashMap};
    use std::rc::Rc;

    #[derive(Default)]
    struct State {
        bursts: HashMap<String, Vec<Vec<u8>>>,
        pending: Vec<Vec<u8>>,
        writes: Vec<(String, Vec<u8>)>,
        reject: BTreeSet<String>,
        opens: u32,
    }

    struct Dev {
        sh: Rc<RefCell<State>>,
        path: String,
    }

    impl HidIo for Dev {
        fn write(&mut self, data: &[u8], _timeout_ms: u32) -> bool {
            // The only requests the driver may send: empty-payload GETs.
            assert_eq!(data.len(), 4);
            assert_eq!(data[1], 2);
            assert_ne!(data[2] & 0x80, 0);
            assert_eq!(data[3], 0);
            let mut sh = self.sh.borrow_mut();
            sh.writes.push((self.path.clone(), data.to_vec()));
            if sh.reject.contains(&self.path) {
                return false;
            }
            if data[2] == 0x80 | K_WAKE_ALL {
                if let Some(burst) = sh.bursts.get(&self.path).cloned() {
                    sh.pending = burst;
                }
            }
            true
        }
        fn read(&mut self, buf: &mut Vec<u8>, timeout_ms: u32) -> i32 {
            assert!(timeout_ms > 0 && timeout_ms <= 1000);
            let mut sh = self.sh.borrow_mut();
            if sh.pending.is_empty() {
                return -1;
            }
            let r = sh.pending.remove(0);
            buf.clear();
            buf.extend_from_slice(&r);
            r.len() as i32
        }
        // Not part of the protocol; the C++ mock left these to the production transport, which
        // fails on its fake handle.
        fn set_output_and_read(&mut self, _data: &[u8], _buf: &mut Vec<u8>, _timeout_ms: u32) -> i32 {
            -1
        }
        fn flush(&mut self) {}
        fn set_feature(&mut self, _data: &[u8]) -> bool {
            false
        }
        fn get_feature(&mut self, _id: u8, _out: &mut Vec<u8>) -> bool {
            false
        }
        fn get_input_report(&mut self, _id: u8, _out: &mut Vec<u8>) -> bool {
            false
        }
    }

    struct Factory {
        sh: Rc<RefCell<State>>,
    }

    impl Factory {
        fn writes(&self) -> Vec<(String, Vec<u8>)> {
            self.sh.borrow().writes.clone()
        }
        fn opens(&self) -> u32 {
            self.sh.borrow().opens
        }
        /// A second handle on the same state, so assertions can read the mock while a context
        /// still borrows the factory.
        fn probe(&self) -> Factory {
            Factory { sh: self.sh.clone() }
        }
    }

    impl HidFactory for Factory {
        fn open(&mut self, coll: &HidColl) -> Option<Box<dyn HidIo>> {
            {
                let mut sh = self.sh.borrow_mut();
                sh.pending.clear(); // C++ Open clears pending
                sh.opens += 1;
            }
            Some(Box::new(Dev { sh: self.sh.clone(), path: coll.path.clone() }))
        }
        fn open_read_only(&mut self, coll: &HidColl) -> Option<Box<dyn HidIo>> {
            self.open(coll)
        }
        fn open_feature_only(&mut self, coll: &HidColl) -> Option<Box<dyn HidIo>> {
            self.open(coll)
        }
    }

    fn collection_on(pid: u16, path: &str, usage: u16, page: u16) -> HidColl {
        HidColl {
            path: path.into(),
            vid: 0x361D,
            pid,
            caps: HidCaps { usage_page: page, usage, input_report_byte_length: 64, output_report_byte_length: 64, ..Default::default() },
            ..Default::default()
        }
    }

    fn collection(pid: u16, path: &str) -> HidColl {
        collection_on(pid, path, 1, 0xFF00)
    }

    /// Input report as Read() hands it over: [report id][2 + n][command][n][payload], zero-padded.
    fn reply(id: u8, command: u8, payload: &[u8]) -> Vec<u8> {
        let mut r = vec![0u8; 64];
        r[0] = id;
        r[1] = (2 + payload.len()) as u8;
        r[2] = command;
        r[3] = payload.len() as u8;
        r[4..4 + payload.len()].copy_from_slice(payload);
        r
    }
    fn ulx(command: u8, payload: &[u8]) -> Vec<u8> {
        reply(0x05, command, payload)
    }
    fn slx(command: u8, payload: &[u8]) -> Vec<u8> {
        reply(0x02, command, payload)
    }
    fn millivolts(mv: i32) -> Vec<u8> {
        vec![(mv & 0xFF) as u8, ((mv >> 8) & 0xFF) as u8]
    }

    /// The only requests the driver may send: empty-payload GETs, zero-padded by Write().
    fn get(id: u8, command: u8) -> Vec<u8> {
        vec![id, 2, 0x80 | command, 0]
    }

    fn factory(data: Vec<(&str, Vec<Vec<u8>>)>, reject: Vec<&str>) -> Factory {
        let sh = Rc::new(RefCell::new(State::default()));
        {
            let mut st = sh.borrow_mut();
            for (path, burst) in data {
                st.bursts.insert(path.to_string(), burst);
            }
            for path in reject {
                st.reject.insert(path.to_string());
            }
        }
        Factory { sh }
    }

    fn poll_with(
        colls: Vec<HidColl>,
        data: Vec<(&str, Vec<Vec<u8>>)>,
        reject: Vec<&str>,
    ) -> (Factory, Vec<DeviceStatus>, BTreeSet<(u16, u16)>) {
        let mut f = factory(data, reject);
        let (out, claimed) = {
            let mut ctx = PollContext::new(&mut f);
            ctx.colls = colls;
            poll_finalmouse(&mut ctx);
            (ctx.out, ctx.claimed)
        };
        (f, out, claimed)
    }

    fn poll(colls: Vec<HidColl>, data: Vec<(&str, Vec<Vec<u8>>)>) -> (Factory, Vec<DeviceStatus>, BTreeSet<(u16, u16)>) {
        poll_with(colls, data, vec![])
    }

    #[test]
    fn finalmouse_driver_test() {
        let ulx_coll = collection(0x0100, "ulx");
        // ULX: xpanel's first read (lift-off, 21) and wake/all (96) on output report 04; the reply
        // burst on input report 05 carries the voltage (3880 mV = 50% on xpanel's curve) and the
        // charging state.
        let mut f = factory(
            vec![(
                "ulx",
                vec![
                    reply(0x03, 10, &[b'1', b'.', b'0', 0]), // dongle firmware on report 03: ignored
                    ulx(3, &millivolts(1600)),               // DPI
                    ulx(5, &millivolts(3880)),
                    ulx(37, &[1]),
                ],
            )],
            vec![],
        );
        let probe = f.probe();
        let mut ctx = PollContext::new(&mut f);
        ctx.colls = vec![ulx_coll.clone()];
        poll_finalmouse(&mut ctx);
        let w = probe.writes();
        assert_eq!(w.len(), 2);
        assert_eq!(w[0].1, get(0x04, 21));
        assert_eq!(w[1].1, get(0x04, 96));
        assert_eq!(ctx.out.len(), 1);
        assert!(ctx.is_claimed(0x361D, 0x0100));
        let s = &ctx.out[0];
        assert_eq!(s.percent, 50);
        assert_eq!(s.millivolts, 3880);
        assert!(s.charging);
        assert!(!s.asleep);
        assert!(s.connected);
        assert_eq!(s.name, "Finalmouse UltralightX");
        assert_eq!(s.key, "finalmouse:0100");
        assert_eq!(s.kind, DeviceKind::Mouse);
        assert_eq!(s.via, "2.4 GHz receiver");
        assert_eq!(s.grace_sec, 1800);
        // Claimed devices are not queried again.
        let before = probe.opens();
        poll_finalmouse(&mut ctx);
        assert_eq!(probe.opens(), before);
        assert_eq!(ctx.out.len(), 1);

        // Same calibration points as xpanel (and OpenMouse's tests); the charging state may come first.
        const CURVE: [(i32, i32); 7] = [(2950, 0), (3000, 0), (3640, 8), (3880, 50), (4276, 88), (4380, 100), (4450, 100)];
        for &(mv, pct) in CURVE.iter() {
            let (_f, out, _) = poll(vec![ulx_coll.clone()], vec![("ulx", vec![ulx(37, &[0]), ulx(5, &millivolts(mv))])]);
            assert_eq!(out.len(), 1, "mv {mv}");
            assert_eq!(out[0].percent, pct, "mv {mv}");
            assert!(!out[0].charging, "mv {mv}");
        }
        // A level without a charging report is still shown (the driver waits briefly, then gives up).
        let (_f, out, _) = poll(vec![ulx_coll.clone()], vec![("ulx", vec![ulx(5, &millivolts(4170))])]);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].percent, 75);
        assert!(!out[0].charging);
        // A state of charge (38) wins over the voltage curve when the dongle sends one.
        let (_f, out, _) =
            poll(vec![ulx_coll.clone()], vec![("ulx", vec![ulx(5, &millivolts(3880)), ulx(38, &[64, 0x2C, 0x0F]), ulx(37, &[0])])]);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].percent, 64);
        assert_eq!(out[0].millivolts, 3884);

        // Link down (36 = 0) and no level: the mouse is asleep or off; keep the last value.
        let (_f, out, claimed) = poll(vec![ulx_coll.clone()], vec![("ulx", vec![ulx(36, &[0]), ulx(5, &millivolts(0))])]);
        assert_eq!(out.len(), 1);
        assert!(out[0].asleep);
        assert_eq!(out[0].percent, -1);
        assert_eq!(out[0].millivolts, 0);
        assert!(claimed.contains(&(0x361D, 0x0100)));
        // Link up but no level, malformed or out-of-range frames, or silence: nothing is reported
        // or claimed.
        let bursts: Vec<Vec<Vec<u8>>> = vec![
            vec![ulx(36, &[1])],
            vec![ulx(5, &[0x28])],                          // voltage frame without its second byte
            vec![ulx(5, &millivolts(6000))],                // implausible voltage
            vec![ulx(38, &[101, 0x2C, 0x0F])],              // percentage above 100
            vec![slx(5, &millivolts(3880)), slx(37, &[1])], // SLX report id on the ULX dongle
            vec![reply(0x05, 5, &[])],                      // empty payload
            vec![],
        ];
        for burst in bursts {
            let (_f, out, claimed) = poll(vec![ulx_coll.clone()], vec![("ulx", burst)]);
            assert!(out.is_empty());
            assert!(claimed.is_empty());
        }
        let mut truncated = ulx(5, &millivolts(3880));
        truncated[1] = 3; // inner length too short for the 2-byte payload
        let (_f, out, _) = poll(vec![ulx_coll.clone()], vec![("ulx", vec![truncated])]);
        assert!(out.is_empty());

        // SLX: first read is the profile roster (57), everything on output report 01, replies on 02.
        // The state of charge from 38 is used; a voltage alone does not end the wait early.
        let slx_coll = collection_on(0x0300, "slx", 9, 0xFF00);
        let (f, out, claimed) = poll(
            vec![slx_coll],
            vec![(
                "slx",
                vec![
                    ulx(5, &millivolts(4380)), // ULX report id: ignored on SLX
                    slx(16, &millivolts(1600)),
                    slx(5, &millivolts(3880)),
                    slx(38, &[76, 0x44, 0x0F]),
                    slx(37, &[0]),
                ],
            )],
        );
        let w = f.writes();
        assert_eq!(w.len(), 2);
        assert_eq!(w[0].1, get(0x01, 57));
        assert_eq!(w[1].1, get(0x01, 96));
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].percent, 76);
        assert_eq!(out[0].millivolts, 0x0F44);
        assert_eq!(out[0].name, "Finalmouse Starlight X");
        assert_eq!(out[0].key, "finalmouse:0300");
        assert!(!out[0].charging);
        assert!(claimed.contains(&(0x361D, 0x0300)));
        // Voltage only: fall back to xpanel's curve once the burst is over.
        let (_f, out, _) = poll(vec![collection(0x0301, "slx2")], vec![("slx2", vec![slx(37, &[1]), slx(5, &millivolts(4276))])]);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].percent, 88);
        assert!(out[0].charging);
        assert_eq!(out[0].key, "finalmouse:0301");

        // SLX: the usage is not pinned down. Usage 1 is tried first; a collection that rejects
        // output report 01 or stays silent is skipped and the next one is used.
        let (f, out, _) = poll_with(
            vec![
                collection_on(0x0300, "slx-b", 2, 0xFF00),
                collection_on(0x0300, "slx-c", 3, 0xFF00),
                collection_on(0x0300, "slx-a", 1, 0xFF00),
            ],
            vec![("slx-c", vec![slx(38, &[40, 0, 0])])],
            vec!["slx-a"],
        );
        let w = f.writes();
        assert_eq!(w.len(), 1 + 2 + 2);
        assert_eq!(w[0].0, "slx-a");
        assert_eq!(w[1].0, "slx-b");
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].percent, 40);
        assert_eq!(out[0].millivolts, 0);

        // Only the known dongles and their vendor collection are touched: not other vendors, the
        // mice on their cable, the ULX dongle's other collections, or another usage page.
        let (f1, _out1, _) = poll(
            vec![
                collection(0x0102, "ulx-cable"),
                collection(0x0310, "slx-cable"),
                collection_on(0x0100, "ulx-u2", 2, 0xFF00),
                collection_on(0x0300, "slx-ff01", 1, 0xFF01),
                collection_on(0x0100, "ulx-mouse", 2, 0x0001),
            ],
            vec![],
        );
        assert_eq!(f1.opens(), 0);
        let mut other_vendor = collection(0x0100, "other");
        other_vendor.vid = 0x361E;
        let mut no_output = collection(0x0100, "no-output");
        no_output.caps.output_report_byte_length = 0;
        let (f2, out2, _) = poll(vec![other_vendor, no_output], vec![]);
        assert_eq!(f2.opens(), 0);
        assert!(f2.writes().is_empty());
        assert!(out2.is_empty());
    }
}
