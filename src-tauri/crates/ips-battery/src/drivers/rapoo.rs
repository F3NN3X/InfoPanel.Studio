//! Rapoo VT gaming mice. Battery is pushed periodically; no commands or handshake are needed.
//! Sources:
//!  * Official Rapoo Hub (https://hub.rapoo.cn/), VT_nrf54L input-report decoder and hardware
//!    manifests: report 07 on FF00:0002, state at byte 7, percent at byte 8, optional mouse PID
//!    at 13..14. Connection is the low nibble of byte 1 (0 RF / 1 BT / 2 USB).
//!  * https://github.com/PyFlat/Device-Battery-Info (RapooProtocol.cs): older 7-byte BB B0
//!    reports on FF00:0002, state at byte 5, percent at byte 6; charging can report 7F (unknown).
//!  * VT1 Pro Max (receiver 1233, cable 4433): USBpcap captures from the owner in issue #136 show
//!    the same passive 7-byte report on interface 1 / FF00:0002, sent without any request:
//!    receiver `BB B0 71 84 03 01 64` every ~3.2 s (Rapoo app: 100%), cable while charging
//!    `BB B0 71 84 03 02 5F` (state 2 = charging, 95%).
//! Legacy BB semantics are restricted to the product IDs above; other Telink firmware differs.

use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{hex4, hid_product, HidIo, PollContext};
use crate::win::now_ms;

// ---- rapoo_protocol.h: the passive status frame decoder ------------------------------------------
//
// Passive Rapoo status reports, including the report ID (hidapi/Win32 convention).
// Kept independent of Win32 so captured frames can be checked without a mouse.

#[derive(Clone, Copy, PartialEq, Eq)]
enum Connection { Unknown, Receiver, Bluetooth, Cable }

#[derive(Clone, Copy, PartialEq, Eq)]
enum Profile { Nordic54L, LegacyVT3Pro }

struct Battery {
    percent: i32,       // -1 = unknown
    charging: bool,
    connection: Connection,
    mouse_pid: u16,
}

fn decode_battery(data: &[u8], profile: Profile) -> Option<Battery> {
    if data.is_empty() { return None; }
    let mut result = Battery { percent: -1, charging: false, connection: Connection::Unknown, mouse_pid: 0 };
    let (state, percent): (u8, u8) = if profile == Profile::Nordic54L && data[0] == 0x07 {
        // Nordic 54L: mode, DPI gear, X/Y DPI, battery state, percentage.
        if data.len() < 9 || (data[1] & 0x0F) > 2 { return None; }
        match data[1] & 0x0F {
            0 => result.connection = Connection::Receiver,
            1 => result.connection = Connection::Bluetooth,
            2 => result.connection = Connection::Cable,
            _ => {}
        }
        if data.len() >= 15 { result.mouse_pid = (data[13] as u16) | ((data[14] as u16) << 8); }
        (data[7], data[8])
    } else if profile == Profile::LegacyVT3Pro && data[0] == 0xBB {
        // VT3 Pro firmware: BB B0 mode DPI-lo DPI-hi battery-state percentage.
        if data.len() < 7 || data[1] != 0xB0 { return None; }
        (data[5], data[6])
    } else {
        return None;
    };
    // 0 = invalid/transition. Some older firmware uses 7F instead of a level while charging.
    if state != 1 && state != 2 { return None; }
    if percent > 100 && !(profile == Profile::LegacyVT3Pro && state == 2 && percent == 0x7F) { return None; }
    result.charging = state == 2;
    if percent <= 100 { result.percent = percent as i32; }
    Some(result)
}

// ---- models -------------------------------------------------------------------------------------

// Selected names from Rapoo's manifests. Support is determined by the collection and valid
// status frame, so other models on the same protocol work without extending this table.
struct Model { cable: u16, receiver: u16, name: &'static str }

const MODELS: [Model; 17] = [
    Model { cable: 0x4610, receiver: 0x1410, name: "Rapoo VT0" },
    Model { cable: 0x4620, receiver: 0x1420, name: "Rapoo VT0 Max" },
    Model { cable: 0x4615, receiver: 0x1415, name: "Rapoo VT1" },
    Model { cable: 0x4644, receiver: 0x1444, name: "Rapoo VT1 Max" },
    Model { cable: 0x4622, receiver: 0x1422, name: "Rapoo VT2" },
    Model { cable: 0x4623, receiver: 0x1423, name: "Rapoo VT2 Max" },
    Model { cable: 0x4612, receiver: 0x1412, name: "Rapoo VT3" },
    Model { cable: 0x4617, receiver: 0x1417, name: "Rapoo VT3 Max (Gen 2)" },
    Model { cable: 0x4B06, receiver: 0x1B06, name: "Rapoo VT3 Max V2" },
    Model { cable: 0x4611, receiver: 0x1411, name: "Rapoo VT3S" },
    Model { cable: 0x4621, receiver: 0x1421, name: "Rapoo VT3S Max" },
    Model { cable: 0x4613, receiver: 0x1413, name: "Rapoo VT7" },
    Model { cable: 0x4616, receiver: 0x1416, name: "Rapoo VT7 Max" },
    Model { cable: 0x4614, receiver: 0x1414, name: "Rapoo VT9" },
    Model { cable: 0x4618, receiver: 0x1418, name: "Rapoo VT9 Max" },
    Model { cable: 0x4415, receiver: 0x1215, name: "Rapoo VT3 Pro" },
    Model { cable: 0x4433, receiver: 0x1233, name: "Rapoo VT1 Pro Max" },
];

fn find_model(pid: u16) -> Option<&'static Model> {
    MODELS.iter().find(|m| pid == m.cable || pid == m.receiver)
}

// Mice confirmed to send the 7-byte BB B0 status report.
fn is_legacy_vt3pro(pid: u16) -> bool {
    pid == 0x1215 || pid == 0x4415  // VT3 Pro
        || pid == 0x1233 || pid == 0x4433  // VT1 Pro Max (issue #136 captures)
}

fn read_battery(d: &mut dyn HidIo, profile: Profile) -> Option<Battery> {
    // A passive legacy report can take ~3-4 seconds (one VT1 Pro Max gap in #136 was 4.03 s), so
    // wait 5 s. One deadline includes unrelated reports;
    // do not flush, since a queued status report is already useful.
    let end = now_ms() + 5000;
    loop {
        let left = (end as i64 - now_ms() as i64) as i32;
        let mut r = Vec::new();
        if left <= 0 || d.read(&mut r, left as u32) < 0 { return None; }
        if let Some(battery) = decode_battery(&r, profile) { return Some(battery); }
        if now_ms() >= end { return None; }  // do { ... } while (GetTickCount64() < end)
    }
}

pub fn poll_rapoo(ctx: &mut PollContext) {
    for &(vid, pid) in &ctx.products(0x24AE) {
        for c in ctx.find(vid, pid, |c| {
            // The other vendor collections are for configuration/firmware, not battery.
            c.page() == 0xFF00 && c.usage() == 0x0002
                && (c.in_len() == 19 || (c.in_len() == 7 && is_legacy_vt3pro(pid)))
        }) {
            let Some(mut d) = ctx.open(&c) else { continue };
            let profile = if c.in_len() == 7 { Profile::LegacyVT3Pro } else { Profile::Nordic54L };
            let Some(battery) = read_battery(d.as_mut(), profile) else { continue };

            let id_pid = if battery.mouse_pid != 0 { battery.mouse_pid } else { pid };
            let model = find_model(id_pid);
            let identity = model.map(|m| m.cable).unwrap_or(id_pid);
            let mut s = DeviceStatus {
                key: format!("rapoo:{}", hex4(identity)),
                name: model.map(|m| m.name.to_string()).unwrap_or_else(|| hid_product(&c)),
                kind: DeviceKind::Mouse,
                percent: battery.percent,
                charging: battery.charging,
                grace_sec: 1800,  // existing UI keeps the last reading, dimmed, while the mouse sleeps
                ..Default::default()
            };
            if s.name.is_empty() || s.name == "Rapoo Gaming Device" {
                s.name = "Rapoo wireless mouse".into();
            }
            if battery.connection == Connection::Cable
                || (battery.connection == Connection::Unknown && model.is_some_and(|m| pid == m.cable))
            {
                s.via = "USB cable".into();
            } else if battery.connection == Connection::Bluetooth {
                s.via = "Bluetooth".into();
            } else {
                s.via = "2.4 GHz receiver".into();
            }

            // A charging mouse can report through both cable and receiver. Keep a single entry,
            // preferring the cable's state but keeping any available percentage. Claim both
            // products before generic fallbacks.
            match ctx.out.iter().position(|other| other.key == s.key) {
                Some(i) => {
                    if s.via == "USB cable" {
                        let receiver_percent = ctx.out[i].percent;
                        ctx.out[i] = s;
                        if ctx.out[i].percent < 0 { ctx.out[i].percent = receiver_percent; }
                    } else if ctx.out[i].percent < 0 && s.percent >= 0 {
                        ctx.out[i].percent = s.percent;
                    }
                    ctx.claim(vid, pid);
                }
                None => ctx.add(s, vid, pid),
            }
            break;
        }
    }
}

// ---- tests (tests/rapoo_protocol_test.cpp, tests/rapoo_driver_test.cpp) --------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hid::mock::MockFactory;
    use crate::hid::{HidCaps, HidColl};

    // ---- tests/rapoo_protocol_test.cpp ----------------------------------------------------------

    #[test]
    fn rapoo_protocol() {
        // Captured on the user's VT3 Max Gen 2, receiver 24AE:1417, FF00:0002.
        let captured: Vec<u8> = vec![
            0x07, 0x20, 0x03, 0x20, 0x03, 0x20, 0x03, 0x01, 0x19, 0x00,
            0x04, 0x84, 0x00, 0x17, 0x46, 0x00, 0x02, 0x03, 0xBC,
        ];
        let b = decode_battery(&captured, Profile::Nordic54L).expect("captured frame");
        assert_eq!(b.percent, 25);
        assert!(!b.charging);
        assert_eq!(b.mouse_pid, 0x4617);
        assert!(b.connection == Connection::Receiver, "receiver frame");

        // Also captured live after connecting the cable (before its percentage increased).
        let captured_cable: Vec<u8> = vec![
            0x07, 0x22, 0x03, 0x20, 0x03, 0x20, 0x03, 0x02, 0x19, 0x00,
            0x04, 0x84, 0x00, 0x17, 0x46, 0x00, 0x02, 0x03, 0x00,
        ];
        let b = decode_battery(&captured_cable, Profile::Nordic54L).expect("captured cable frame");
        assert_eq!(b.percent, 25);
        assert!(b.charging);
        assert_eq!(b.mouse_pid, 0x4617);
        assert!(b.connection == Connection::Cable, "cable frame");

        let mut modern = captured.clone();
        modern[1] = 0x22;  // sensor bits must not affect the connection type
        modern[7] = 2;
        modern[8] = 100;
        let b = decode_battery(&modern, Profile::Nordic54L).expect("modern frame, state 2 / 100%");
        assert!(b.charging);
        assert_eq!(b.percent, 100);
        assert!(b.connection == Connection::Cable, "USB connection, sensor bits 0x22");
        modern[1] = 0x21;
        modern[7] = 1;
        modern[8] = 0;
        let b = decode_battery(&modern, Profile::Nordic54L).expect("modern frame, BT / 0%");
        assert_eq!(b.percent, 0);
        assert!(!b.charging);
        assert!(b.connection == Connection::Bluetooth, "BT connection, sensor bits 0x21");
        modern[1] = 0x23;
        assert!(decode_battery(&modern, Profile::Nordic54L).is_none(), "mode nibble 3 is not a connection");

        let mut legacy: Vec<u8> = vec![0xBB, 0xB0, 0x81, 0x20, 0x03, 1, 37];
        let legacy_profile = Profile::LegacyVT3Pro;
        assert!(decode_battery(&legacy, Profile::Nordic54L).is_none());
        assert!(decode_battery(&captured, legacy_profile).is_none());
        let b = decode_battery(&legacy, legacy_profile).expect("legacy frame");
        assert_eq!(b.percent, 37);
        assert!(!b.charging);
        assert_eq!(b.mouse_pid, 0);
        assert!(b.connection == Connection::Unknown, "legacy frame has no connection byte");
        legacy[5] = 2;
        legacy[6] = 0x7F;
        let b = decode_battery(&legacy, legacy_profile).expect("legacy charging sentinel");
        assert!(b.charging);
        assert_eq!(b.percent, -1);  // unknown must never become 100%
        legacy[6] = 100;
        let b = decode_battery(&legacy, legacy_profile).expect("legacy 100%");
        assert_eq!(b.percent, 100);
        assert!(b.charging);
        legacy[5] = 1;
        let b = decode_battery(&legacy, legacy_profile).expect("legacy, back to not charging");
        assert!(!b.charging);  // a previous charging reading must not leak into this one

        // VT1 Pro Max (24AE:1233 receiver / 24AE:4433 cable), USBPcap captures from issue #136.
        let vt1_pro_max_receiver: Vec<u8> = vec![0xBB, 0xB0, 0x71, 0x84, 0x03, 0x01, 0x64];
        let b = decode_battery(&vt1_pro_max_receiver, legacy_profile).expect("VT1 Pro Max receiver");
        assert_eq!(b.percent, 100);
        assert!(!b.charging);
        let vt1_pro_max_cable: Vec<u8> = vec![0xBB, 0xB0, 0x71, 0x84, 0x03, 0x02, 0x5F];
        let b = decode_battery(&vt1_pro_max_cable, legacy_profile).expect("VT1 Pro Max cable");
        assert_eq!(b.percent, 95);
        assert!(b.charging);

        for size in 0..9 {
            assert!(decode_battery(&captured[..size], Profile::Nordic54L).is_none(),
                    "modern report of {size} bytes");
        }
        for size in 0..7 {
            assert!(decode_battery(&legacy[..size], legacy_profile).is_none(),
                    "legacy report of {size} bytes");
        }
        // The C++ test passed nullptr with a nonzero size; an empty slice is the Rust equivalent
        // (both are rejected by the null/empty guard before any byte is read).
        assert!(decode_battery(&[], Profile::Nordic54L).is_none());
        // Short modern reports have no optional model ID.
        let b = decode_battery(&captured[..9], Profile::Nordic54L).expect("9-byte modern report");
        assert_eq!(b.mouse_pid, 0);

        for state in [0u8, 3, 255] {
            modern = captured.clone();
            modern[7] = state;
            assert!(decode_battery(&modern, Profile::Nordic54L).is_none(), "modern state {state}");
            legacy[5] = state;
            assert!(decode_battery(&legacy, legacy_profile).is_none(), "legacy state {state}");
        }
        for pct in [101u8, 126, 127, 128, 255] {
            modern = captured.clone();
            modern[8] = pct;
            assert!(decode_battery(&modern, Profile::Nordic54L).is_none(), "modern percent {pct}");
            legacy[5] = 1;
            legacy[6] = pct;
            assert!(decode_battery(&legacy, legacy_profile).is_none(), "legacy percent {pct}");
        }
        legacy = vec![0xBC, 0xB0, 0x81, 0x20, 0x03, 1, 50, 0, 0, 0];
        assert!(decode_battery(&legacy, legacy_profile).is_none(), "wrong report ID");
        legacy[0] = 0xBB;
        legacy[1] = 0;
        assert!(decode_battery(&legacy, legacy_profile).is_none(), "mode byte not B0");
        modern = captured_cable.clone();
        modern[8] = 0x7F;
        assert!(decode_battery(&modern, Profile::Nordic54L).is_none());  // sentinel is legacy-only
        modern = captured.clone();
        modern[0] = 0x08;  // CH584 has a separate protocol; do not claim it as Nordic support
        assert!(decode_battery(&modern, Profile::Nordic54L).is_none());
    }

    // ---- tests/rapoo_driver_test.cpp ------------------------------------------------------------

    fn collection(pid: u16, path: &str, length: u16) -> HidColl {
        HidColl {
            path: path.to_string(),
            vid: 0x24AE,
            pid,
            caps: HidCaps {
                usage_page: 0xFF00,
                usage: 2,
                input_report_byte_length: length,
                ..Default::default()
            },
            ..Default::default()
        }
    }

    fn status(cable: bool, percent: u8) -> Vec<u8> {
        vec![7, if cable { 0x22 } else { 0x20 }, 3, 0x20, 3, 0x20, 3,
             if cable { 2 } else { 1 }, percent, 0, 4, 0x84, 0, 0x17, 0x46, 0, 2, 3, 0xBC]
    }

    // The C++ test's `ctx = {}; ctx.colls = {...}` reset; the Rust context borrows its factory, so
    // each C++ poll gets a fresh context over a fresh mock.
    fn ctx_for<'a>(io: &'a mut MockFactory, colls: Vec<HidColl>) -> PollContext<'a> {
        let mut ctx = PollContext::new(io);
        ctx.colls = colls;
        ctx
    }

    #[test]
    fn rapoo_driver() {
        let receiver = collection(0x1417, "receiver", 19);
        let cable = collection(0x4617, "cable", 19);
        // Ignore an unrelated packet and accept the next status; cable wins over receiver.
        let mut io = MockFactory::new()
            .with_reads(vec![vec![0xBC, 0], status(false, 25), status(true, 27)]);
        let mut ctx = ctx_for(&mut io, vec![receiver.clone(), cable.clone()]);
        poll_rapoo(&mut ctx);
        assert_eq!(ctx.out.len(), 1);
        assert_eq!(ctx.out[0].key, "rapoo:4617");
        assert_eq!(ctx.out[0].percent, 27);
        assert!(ctx.out[0].charging);
        assert_eq!(ctx.out[0].via, "USB cable");
        assert_eq!(ctx.out[0].kind, DeviceKind::Mouse);
        assert_eq!(ctx.out[0].grace_sec, 1800);
        assert!(ctx.is_claimed(0x24AE, 0x1417));
        assert!(ctx.is_claimed(0x24AE, 0x4617));
        let stable_key = ctx.out[0].key.clone();

        let mut io = MockFactory::new().with_reads(vec![status(false, 25)]);
        let mut ctx = ctx_for(&mut io, vec![receiver.clone()]);
        poll_rapoo(&mut ctx);
        assert_eq!(ctx.out.len(), 1);
        assert_eq!(ctx.out[0].key, stable_key);
        assert!(!ctx.out[0].charging);
        assert_eq!(ctx.out[0].percent, 25);
        assert_eq!(ctx.out[0].via, "2.4 GHz receiver");

        let mut io = MockFactory::new();
        let mut ctx = ctx_for(&mut io, vec![receiver.clone()]);
        // timeout must not claim an unknown/sleeping device or invent a level
        poll_rapoo(&mut ctx);
        assert!(ctx.out.is_empty());
        assert!(ctx.claimed.is_empty());

        let mut io = MockFactory::new().with_reads(vec![
            vec![0xBB, 0xB0, 0x81, 0x20, 3, 1, 37],
            vec![0xBB, 0xB0, 0x81, 0x20, 3, 2, 0x7F],
        ]);
        let mut ctx = ctx_for(&mut io, vec![
            collection(0x1215, "legacy", 7),
            collection(0x4415, "legacy-cable", 7),
        ]);
        poll_rapoo(&mut ctx);
        assert_eq!(ctx.out.len(), 1);
        assert_eq!(ctx.out[0].key, "rapoo:4415");
        assert!(ctx.out[0].charging);
        assert_eq!(ctx.out[0].percent, 37);
        assert_eq!(ctx.out[0].via, "USB cable");

        // A cable-only unknown level stays unknown; a later receiver reading can fill it without
        // clearing the cable's charging state.
        let mut io = MockFactory::new()
            .with_reads(vec![vec![0xBB, 0xB0, 0x81, 0x20, 3, 2, 0x7F]]);
        let probe = io.clone();
        let mut ctx = ctx_for(&mut io, vec![collection(0x4415, "legacy-cable", 7)]);
        poll_rapoo(&mut ctx);
        assert_eq!(ctx.out.len(), 1);
        assert!(ctx.out[0].charging);
        assert_eq!(ctx.out[0].percent, -1);
        // The same context polls again; re-arm the shared transport (clones share their state) and
        // swap the collection, as the C++ test did with `ctx.colls = {...}`.
        let _ = probe.clone().with_reads(vec![vec![0xBB, 0xB0, 0x81, 0x20, 3, 1, 37]]);
        ctx.colls = vec![collection(0x1215, "legacy", 7)];
        poll_rapoo(&mut ctx);
        assert_eq!(ctx.out.len(), 1);
        assert!(ctx.out[0].charging);
        assert_eq!(ctx.out[0].percent, 37);
        assert_eq!(ctx.out[0].via, "USB cable");

        // VT1 Pro Max uses the same BB report (issue #136 captures).
        let mut io = MockFactory::new()
            .with_reads(vec![vec![0xBB, 0xB0, 0x71, 0x84, 3, 1, 0x64]]);
        let mut ctx = ctx_for(&mut io, vec![collection(0x1233, "vt1pm", 7)]);
        poll_rapoo(&mut ctx);
        assert_eq!(ctx.out.len(), 1);
        assert_eq!(ctx.out[0].key, "rapoo:4433");
        assert_eq!(ctx.out[0].name, "Rapoo VT1 Pro Max");
        assert_eq!(ctx.out[0].percent, 100);
        assert!(!ctx.out[0].charging);
        assert_eq!(ctx.out[0].via, "2.4 GHz receiver");
        let mut io = MockFactory::new()
            .with_reads(vec![vec![0xBB, 0xB0, 0x71, 0x84, 3, 2, 0x5F]]);
        let mut ctx = ctx_for(&mut io, vec![collection(0x4433, "vt1pm-cable", 7)]);
        poll_rapoo(&mut ctx);
        assert_eq!(ctx.out.len(), 1);
        assert_eq!(ctx.out[0].key, "rapoo:4433");
        assert!(ctx.out[0].charging);
        assert_eq!(ctx.out[0].percent, 95);
        assert_eq!(ctx.out[0].via, "USB cable");

        // The same marker does not select legacy semantics on a modern Nordic collection.
        let mut io = MockFactory::new()
            .with_reads(vec![vec![0xBB, 0xB0, 0x81, 0x20, 3, 2, 50]]);
        let mut ctx = ctx_for(&mut io, vec![receiver.clone()]);
        poll_rapoo(&mut ctx);
        assert!(ctx.out.is_empty());
        assert!(ctx.claimed.is_empty());

        // Same collection/protocol on an unlisted PID should work, without an invented model name.
        let mut unknown_model = status(false, 62);
        unknown_model[13] = 0;
        unknown_model[14] = 0;
        let mut io = MockFactory::new().with_reads(vec![unknown_model]);
        let mut ctx = ctx_for(&mut io, vec![collection(0x7ABC, "new-model", 19)]);
        poll_rapoo(&mut ctx);
        assert_eq!(ctx.out.len(), 1);
        assert_eq!(ctx.out[0].name, "Rapoo wireless mouse");
        assert_eq!(ctx.out[0].key, "rapoo:7ABC");
        assert_eq!(ctx.out[0].percent, 62);

        let mut other_vendor = receiver.clone();
        other_vendor.vid = 0x1234;
        let mut config = receiver.clone();
        config.caps.usage = 14;
        let mut wrong_page = receiver.clone();
        wrong_page.caps.usage_page = 1;
        let mut io = MockFactory::new();
        let probe = io.clone();
        let mut ctx = ctx_for(&mut io, vec![
            other_vendor,
            config,
            wrong_page,
            collection(0x1215, "silent-sibling", 10),
            collection(0x1C00, "unrecognised-telink", 7),
        ]);
        poll_rapoo(&mut ctx);
        assert!(ctx.out.is_empty());
        assert_eq!(probe.opens(), 0, "no battery collection was opened");
        // The C++ test replaced ctx.colls and claimed one product on the same context.
        ctx.colls = vec![receiver.clone()];
        ctx.claim(receiver.vid, receiver.pid);
        poll_rapoo(&mut ctx);
        assert_eq!(probe.opens(), 0, "a claimed product is never opened again");
    }
}
