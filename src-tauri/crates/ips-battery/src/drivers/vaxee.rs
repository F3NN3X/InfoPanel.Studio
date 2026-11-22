//! VAXEE 4K and 8K receivers and ZYGEN NP-01S V2 USB cable. Protocol reference:
//! https://github.com/stuffz/mouse-battery-monitor/blob/main/docs/VAXEE.md
//! Only battery (0B) and charging (10) reads are sent; never configuration writes.
use std::collections::BTreeMap;
use std::sync::Mutex;

use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{HidIo, PollContext, hex4};
use crate::win::sleep_ms;

const K_VID: u16 = 0x3057;
const K_RECEIVER: u16 = 0x1002;
const K_RECEIVER_8K: u16 = 0x2002;
const K_CABLE: u16 = 0x1011;

fn supported(pid: u16) -> bool {
    pid == K_RECEIVER || pid == K_RECEIVER_8K || pid == K_CABLE
}

fn query(d: &mut dyn HidIo, command: u8, value: &mut u8) -> bool {
    let mut request = vec![0u8; 64];
    request[0] = 0x0E;
    request[1] = 0xA5;
    request[2] = command;
    request[3] = 0x01; // READ, not WRITE (02)
    request[4] = 0x01;
    if !d.set_feature(&request) {
        return false;
    }
    sleep_ms(100);
    let mut reply = Vec::new();
    if !d.get_feature(0x0E, &mut reply) || reply.len() < 6 || reply[0] != 0x0E || reply[1] != 0xA5 || reply[2] != command || reply[4] != 1 {
        return false;
    }
    *value = reply[5];
    true
}

/// Last good status by collection path (C++ function-local `static std::map lastGood`).
static LAST_GOOD: Mutex<BTreeMap<String, DeviceStatus>> = Mutex::new(BTreeMap::new());

pub fn poll_vaxee(ctx: &mut PollContext) {
    // End the UI's sleeping-device grace period immediately when the physical
    // USB device disappears (including moving the cable from receiver to mouse).
    {
        let mut last_good = LAST_GOOD.lock().unwrap();
        let mut gone: Vec<String> = Vec::new();
        for (path, st) in last_good.iter() {
            if ctx.colls.iter().any(|c| c.path == *path) {
                continue;
            }
            let mut gone_status = st.clone();
            gone_status.connected = false;
            gone_status.percent = -1;
            gone_status.charging = false;
            ctx.out.push(gone_status);
            gone.push(path.clone());
        }
        for path in gone {
            last_good.remove(&path);
        }
    }
    for &(_vid, pid) in &ctx.products(K_VID) {
        if !supported(pid) {
            continue;
        }
        for c in ctx.find(K_VID, pid, |c| c.page() == 0xFF05 && c.usage() == 1 && c.feat_len() == 64) {
            let Some(mut d) = ctx.open_feature_only(&c) else { continue };
            let mut battery = 0u8;
            let mut valid = false;
            for _attempt in 0..2 {
                valid = query(&mut *d, 0x0B, &mut battery) && battery <= 20;
                if valid {
                    break;
                }
            }
            if !valid {
                continue;
            } // UI keeps the last reading dimmed during the grace period.
            let mut s = DeviceStatus {
                key: format!("vaxee:{}:{}:{}", hex4(c.vid), hex4(c.pid), c.iface),
                name: if pid == K_CABLE {
                    "ZYGEN NP-01S V2 Wireless"
                } else if pid == K_RECEIVER_8K {
                    "VAXEE 8K Wireless"
                } else {
                    "VAXEE wireless mouse"
                }
                .into(),
                kind: DeviceKind::Mouse,
                via: if pid == K_CABLE { "USB cable" } else { "2.4 GHz receiver" }.into(),
                percent: battery as i32 * 5,
                grace_sec: 1800,
                ..Default::default()
            };
            let mut charging = 0u8;
            if query(&mut *d, 0x10, &mut charging) {
                s.charging = charging != 0;
            }
            LAST_GOOD.lock().unwrap().insert(c.path.clone(), s.clone());
            ctx.add(s, K_VID, pid);
            break;
        }
    }
}

#[cfg(test)]
mod tests {
    //! Port of tests/vaxee_driver_test.cpp: simulated HID replies; checks read-only commands,
    //! validation and device filtering.
    use super::*;
    use crate::devices::DeviceStatus;
    use crate::hid::mock::MockFactory;
    use crate::hid::{HidCaps, HidColl};
    use std::collections::BTreeSet;

    fn collection() -> HidColl {
        HidColl {
            path: "test-receiver".into(),
            vid: 0x3057,
            pid: 0x1002,
            caps: HidCaps { usage_page: 0xFF05, usage: 1, feature_report_byte_length: 64, ..Default::default() },
            ..Default::default()
        }
    }

    fn reply(command: u8, value: u8) -> Vec<u8> {
        let mut r = vec![0u8; 64];
        r[0] = 0x0E;
        r[1] = 0xA5;
        r[2] = command;
        r[3] = 1;
        r[4] = 1;
        r[5] = value;
        r
    }

    /// The request the C++ test's SetFeature asserted byte for byte.
    fn request(command: u8) -> Vec<u8> {
        let mut w = vec![0u8; 64];
        w[0] = 0x0E;
        w[1] = 0xA5;
        w[2] = command;
        w[3] = 0x01; // READ, not WRITE
        w[4] = 0x01;
        w
    }

    /// C++ `PollVaxee(unplugged)`: reset the module-level lastGood cache.
    fn reset_cache() {
        let mut scratch = MockFactory::new();
        let mut unplugged = PollContext::new(&mut scratch);
        poll_vaxee(&mut unplugged);
    }

    struct Polled {
        probe: MockFactory, // clone of the mock the context used: same state
        out: Vec<DeviceStatus>,
        claimed: BTreeSet<(u16, u16)>,
    }

    fn poll_colls(colls: Vec<HidColl>, replies: Vec<Vec<u8>>, write_ok: bool, open_ok: bool) -> Polled {
        reset_cache();
        let mut io = MockFactory::new().with_feature_reads(replies).with_write_ok(write_ok).with_open_ok(open_ok);
        let probe = io.clone();
        let (out, claimed) = {
            let mut ctx = PollContext::new(&mut io);
            ctx.colls = colls;
            poll_vaxee(&mut ctx);
            (ctx.out, ctx.claimed)
        };
        Polled { probe, out, claimed }
    }

    /// C++ `Poll(data, pid)`.
    fn poll(replies: Vec<Vec<u8>>, pid: u16) -> Polled {
        let mut coll = collection();
        coll.pid = pid;
        if pid == K_CABLE {
            coll.path = "test-cable".into();
        }
        poll_colls(vec![coll], replies, true, true)
    }

    #[test]
    fn vaxee_driver_test() {
        // 4K receiver: 5% steps and the charging flag; one probe for the whole case so the same
        // context can be polled twice, like the C++ reusing `ctx`.
        reset_cache();
        let mut io = MockFactory::new().with_feature_reads(vec![reply(0x0B, 13), reply(0x10, 0)]);
        let probe = io.clone();
        let mut ctx = PollContext::new(&mut io);
        ctx.colls.push(collection());
        poll_vaxee(&mut ctx);
        assert_eq!(ctx.out.len(), 1);
        assert_eq!(ctx.out[0].percent, 65);
        assert!(!ctx.out[0].charging);
        assert!(ctx.is_claimed(0x3057, 0x1002));
        assert_eq!(probe.writes().len(), 2);
        // The C++ mock's SetFeature checked this request shape for every query.
        assert_eq!(probe.writes(), vec![request(0x0B), request(0x10)]);
        assert_eq!(ctx.out[0].via, "2.4 GHz receiver");
        // Claimed devices are not queried again.
        let before = probe.opens();
        poll_vaxee(&mut ctx);
        assert_eq!(probe.opens(), before);
        assert_eq!(ctx.out.len(), 1);

        // 8K receiver.
        let p = poll(vec![reply(0x0B, 12), reply(0x10, 0)], K_RECEIVER_8K);
        assert_eq!(p.out.len(), 1);
        assert_eq!(p.out[0].percent, 60);
        assert_eq!(p.out[0].name, "VAXEE 8K Wireless");
        assert_eq!(p.out[0].via, "2.4 GHz receiver");
        assert!(p.claimed.contains(&(0x3057, 0x2002)));

        // ZYGEN NP-01S V2 on its USB cable.
        let p = poll(vec![reply(0x0B, 14), reply(0x10, 1)], K_CABLE);
        assert_eq!(p.out.len(), 1);
        assert_eq!(p.out[0].percent, 70);
        assert!(p.out[0].charging);
        assert_eq!(p.out[0].name, "ZYGEN NP-01S V2 Wireless");
        assert_eq!(p.out[0].via, "USB cable");
        assert!(p.claimed.contains(&(0x3057, 0x1011)));

        // The physical device disappears: one last status, not connected, nothing claimed.
        let mut io = MockFactory::new();
        let mut unplugged = PollContext::new(&mut io);
        poll_vaxee(&mut unplugged);
        assert_eq!(unplugged.out.len(), 1);
        assert!(!unplugged.out[0].connected);
        assert!(unplugged.claimed.is_empty()); // No hardware is claimed when it is physically gone.
        let mut io2 = MockFactory::new();
        let mut unplugged_again = PollContext::new(&mut io2);
        poll_vaxee(&mut unplugged_again);
        assert!(unplugged_again.out.is_empty());

        let p = poll(vec![reply(0x0B, 20), reply(0x10, 1)], K_RECEIVER);
        assert_eq!(p.out.len(), 1);
        assert_eq!(p.out[0].percent, 100);
        assert!(p.out[0].charging);

        let p = poll(vec![reply(0x0B, 0)], K_RECEIVER);
        assert_eq!(p.out.len(), 1);
        assert_eq!(p.out[0].percent, 0);

        // A bad first battery reply is retried once.
        let p = poll(vec![reply(0x0B, 21), reply(0x0B, 7), reply(0x10, 0)], K_RECEIVER);
        assert_eq!(p.out.len(), 1);
        assert_eq!(p.out[0].percent, 35);
        assert_eq!(p.probe.writes().len(), 3);

        let p = poll(vec![reply(0x0B, 21), reply(0x10, 10)], K_RECEIVER);
        assert!(p.out.is_empty());
        assert!(p.claimed.is_empty());

        let mut bad_header = reply(0x0B, 10);
        bad_header[1] = 0;
        let p = poll(vec![bad_header, vec![0u8; 5]], K_RECEIVER);
        assert!(p.out.is_empty());

        for offset in [0usize, 2, 4] {
            let mut bad = reply(0x0B, 10);
            bad[offset] = 0;
            let p = poll(vec![bad.clone(), bad], K_RECEIVER);
            assert!(p.out.is_empty());
            assert!(p.claimed.is_empty());
            assert_eq!(p.probe.writes().len(), 2);
        }

        // A stale battery reply must not be interpreted as a charging response.
        let p = poll(vec![reply(0x0B, 10), reply(0x0B, 10)], K_RECEIVER);
        assert_eq!(p.out.len(), 1);
        assert_eq!(p.out[0].percent, 50);
        assert!(!p.out[0].charging);

        let p = poll(vec![], K_RECEIVER);
        assert!(p.out.is_empty());

        let p = poll_colls(vec![collection()], vec![reply(0x0B, 10)], false, true);
        assert!(p.out.is_empty());

        let p = poll_colls(vec![collection()], vec![reply(0x0B, 10)], true, false);
        assert!(p.out.is_empty());
        assert!(p.probe.writes().is_empty()); // no query sent

        let mut wrong_vendor = collection();
        let mut wrong_pid = collection();
        let mut wrong_page = collection();
        let mut wrong_usage = collection();
        let mut wrong_length = collection();
        wrong_vendor.vid = 0x1234;
        wrong_pid.pid = 0x0002; // Do not send VAXEE commands to ZOWIE or other mice.
        wrong_page.caps.usage_page = 1;
        wrong_usage.caps.usage = 2;
        wrong_length.caps.feature_report_byte_length = 63;
        let p = poll_colls(vec![wrong_vendor, wrong_pid, wrong_page, wrong_usage, wrong_length], vec![], true, true);
        assert!(p.out.is_empty());
        assert_eq!(p.probe.opens(), 0);
    }
}
