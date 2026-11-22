//! Sony INZONE H9 II (054C:0FA8) and H5 (054C:0EBF) headsets and the INZONE Buds dongle (054C:0EC2):
//! a Sony command layer tunnelled through HID (report 02, 64 bytes) on the vendor collection with
//! usage page FF04.
//!   command: [02][len][01][00 FC][8+n][96 C3][addr][event][type][tid lo][tid hi][payload][sum]
//!   event:   [02][len][04][FF][..][00][96 C3][addr][event][type][tid lo][tid hi][payload][sum]
//! Battery = event 04, type 01 (GET) to the headset (addr 0x41). Both directions carry a checksum
//! and a transaction id.
//!   Headsets: reply payload [charging][percent], percent FF = headset off.
//!   Buds:     reply payload [status][percent] for the left bud, right bud, then case; percent FF =
//!             bud is in the case. With both buds in the case the dongle does not respond. No
//!             charging flag.
//! Protocol from github.com/Sapd/HeadsetControl (sony_inzone_protocol.hpp, sony_inzone_buds.hpp).
//! Buds reply layout and left-first order from github.com/kinako19/inzone-buds-battery-tray and
//! github.com/takamachi66/inzone-buds-battery-tray (docs/protocol*.md).

use std::sync::Mutex;

use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{HidIo, PollContext, hex4};
use crate::win::now_ms;

struct Event {
    id: u8,
    r#type: u8,
    tid: u16,
    payload: Vec<u8>,
}

fn parse_event(b: &[u8]) -> Option<Event> {
    if b.len() < 15 || b[0] != 0x02 {
        return None;
    }
    let len = b[1] as i32;
    if len < 12 || len > 62 || b.len() < (len + 2) as usize {
        return None;
    }
    if b[2] != 0x04 || b[3] != 0xFF || b[5] != 0x00 || b[6] != 0x96 || b[7] != 0xC3 {
        return None;
    }
    if (b[8] >> 4) != 0x1 {
        return None;
    } // must be addressed to the PC
    let mut sum: u32 = 0;
    for i in 5..=(len as usize) {
        sum += b[i] as u32;
    }
    if sum as u8 != b[len as usize + 1] {
        return None;
    }
    Some(Event { id: b[9], r#type: b[10], tid: (b[11] as u16) | ((b[12] as u16) << 8), payload: b[13..(len as usize + 1)].to_vec() })
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Reply {
    Ok,
    NoReply,
    Failed,
}

// C++ function-local `static USHORT tid`; skips 0/1, which the dongle uses for its own notifications.
static TID: Mutex<u16> = Mutex::new(1);

// NoReply/Failed are identical for headset
// For buds, NoReply can imply both buds are in the case
fn get_battery(d: &mut dyn HidIo, min_payload: usize, payload: &mut Vec<u8>) -> Reply {
    let tid = {
        let mut t = TID.lock().unwrap();
        *t = t.wrapping_add(1);
        if *t <= 1 {
            *t = 2;
        } // tid 1 is used by the dongle's own notifications
        *t
    };
    let mut req = vec![0u8; 64];
    req[0] = 0x02;
    req[1] = 12; // HCI byte count (no payload)
    req[2] = 0x01; // HCI command
    req[3] = 0x00;
    req[4] = 0xFC; // vendor opcode 0xFC00
    req[5] = 8;
    req[6] = 0x96;
    req[7] = 0xC3;
    req[8] = 0x41; // PC -> headset
    req[9] = 0x04; // battery info
    req[10] = 0x01; // GET
    req[11] = tid as u8;
    req[12] = (tid >> 8) as u8;
    let mut sum: u32 = 0;
    for i in 6..=12 {
        sum += req[i] as u32;
    }
    req[13] = sum as u8;
    d.flush();
    if !d.write(&req, 500) {
        return Reply::Failed;
    }
    let end = now_ms() + 1500;
    let mut r = Vec::new();
    while (end as i64 - now_ms() as i64) > 0 {
        let left = (end as i64 - now_ms() as i64) as i32;
        if d.read(&mut r, left as u32) < 15 {
            return Reply::NoReply;
        }
        let Some(e) = parse_event(&r) else { continue };
        if e.id != 0x04 || e.tid != tid || e.payload.len() < min_payload {
            continue;
        }
        if e.r#type != 0x10 && e.r#type != 0xA0 {
            continue;
        } // RET or active notification
        *payload = e.payload;
        return Reply::Ok;
    }
    Reply::NoReply
}

// Lowest bud charge percent, or -1 when both are docked. FF = docked
// Values > 100 are invalid and skipped.
fn lowest_bud_out(p: &[u8]) -> i32 {
    let mut lvl = -1;
    for &i in &[1usize, 3] {
        if p[i] > 100 {
            continue;
        }
        lvl = if lvl < 0 { p[i] as i32 } else { lvl.min(p[i] as i32) };
    }
    lvl
}

pub fn poll_sony_inzone(ctx: &mut PollContext) {
    // minPayload: headsets reply [charging][percent];
    // buds reply 3x [status][percent] for both buds + case.
    struct Model {
        pid: u16,
        name: &'static str,
        buds: bool,
        min_payload: usize,
    }
    const MODELS: [Model; 3] = [
        Model { pid: 0x0FA8, name: "Sony INZONE H9 II", buds: false, min_payload: 2 },
        Model { pid: 0x0EBF, name: "Sony INZONE H5", buds: false, min_payload: 2 },
        Model { pid: 0x0EC2, name: "Sony INZONE Buds", buds: true, min_payload: 6 },
    ];
    for m in &MODELS {
        if ctx.is_claimed(0x054C, m.pid) {
            continue;
        }
        let status = || DeviceStatus {
            key: format!("inzone:{}", hex4(m.pid)),
            name: m.name.into(),
            kind: DeviceKind::Headset,
            via: "2.4 GHz receiver".into(),
            ..Default::default()
        };
        let mut added = false;
        let mut no_reply = false;
        for c in ctx.find(0x054C, m.pid, |c| c.page() == 0xFF04 && c.out_len() >= 64) {
            let Some(mut d) = ctx.open(&c) else { continue };
            let mut p = Vec::new();
            let reply = get_battery(d.as_mut(), m.min_payload, &mut p);
            if reply == Reply::NoReply {
                no_reply = true;
            }
            if reply != Reply::Ok {
                continue;
            }
            let mut s = status();
            if m.buds {
                let lvl = lowest_bud_out(&p);
                s.connected = lvl >= 0;
                s.percent = lvl;
            } else {
                let offline = p[1] == 0xFF;
                s.connected = !offline;
                s.percent = if offline {
                    -1
                } else if p[1] <= 100 {
                    p[1] as i32
                } else {
                    -1
                };
                s.charging = p[0] != 0;
            }
            ctx.add(s, 0x054C, m.pid);
            added = true;
            break;
        }
        // Buds: the dongle took the request but no collection answered, which is what it does with both
        // buds in the case. Add them as not connected (hidden) rather than treating the dongle as missing.
        if m.buds && no_reply && !added {
            let mut s = status();
            s.connected = false;
            ctx.add(s, 0x054C, m.pid);
        }
    }
}
