//! Endgame Gear 4K wireless mice (OP1w 4k v1/v2, XM2w 4k v1/v2) on the shared 4K dongle 3367:1970.
//! Protocol from github.com/johanneszab/vole (re/PROTOCOL.md, verified on OP1w 4k v1 and v2 with
//! dongle FW 1.01) and github.com/Janlhin/Endgame_Gear_Web_Configurator (src/session.ts,
//! transport.ts):
//!   Config channel = vendor collection FF01:0002, feature report A1 (64 bytes, no checksum):
//!     [A1][cmd][target][payload len][00 ...], payload from byte 16.
//!   SET_FEATURE the request, wait ~150 ms, GET_FEATURE report A1. Reply byte 1 is the status:
//!     01 ok, 03 busy (read again), 08 / 11 mouse asleep or out of range.
//!   B4 (battery):    reply[16] = percent. No charging flag is decoded for this family.
//!   0E (mouse info): reply[16..17] = 67 33 (VID), reply[18..19] = mouse PID, little endian.
//!   0F (probe):      after a failed command the dongle stays silent until a 0F gets through, so we
//!                    send it only on failure (sending it every poll keeps the mouse from sleeping).
//! Only these read commands are used; the write / reset / re-pair commands are never sent.
//! The older XM2we / OP1we "WE" family uses a different 17-byte protocol and is not handled here.
use std::collections::BTreeMap;
use std::sync::Mutex;

use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{HidIo, PollContext, hex4};
use crate::win::sleep_ms;

const K_VID: u16 = 0x3367;
const K_DONGLE_4K: u16 = 0x1970;

fn mouse_name(pid: u16) -> Option<&'static str> {
    match pid {
        0x1972 => Some("Endgame Gear OP1w 4k"),
        0x1984 => Some("Endgame Gear OP1w 4k v2"),
        0x1968 => Some("Endgame Gear XM2w 4k"),
        0x1982 => Some("Endgame Gear XM2w 4k v2"),
        _ => None,
    }
}

// Sends one command and returns the reply (out[0] = A1). Returns the status byte, or -1 on I/O error.
fn command(d: &mut dyn HidIo, cmd: u8, target: u8, r: &mut Vec<u8>) -> i32 {
    let mut req = vec![0u8; 64];
    req[0] = 0xA1;
    req[1] = cmd;
    req[2] = target;
    if !d.set_feature(&req) {
        return -1;
    }
    for attempt in 0..3 {
        sleep_ms(150 + attempt * 100);
        if !d.get_feature(0xA1, r) || r.len() < 20 || r[0] != 0xA1 {
            return -1;
        }
        if r[1] != 0x03 {
            return r[1] as i32;
        } // 03 = busy, read again
    }
    0x03
}

/// Mouse name by dongle path (C++ function-local `static std::map lastName`): the mouse only
/// identifies itself while awake.
static LAST_NAME: Mutex<BTreeMap<String, String>> = Mutex::new(BTreeMap::new());

pub fn poll_endgame(ctx: &mut PollContext) {
    if ctx.is_claimed(K_VID, K_DONGLE_4K) {
        return;
    }
    for c in ctx.find(K_VID, K_DONGLE_4K, |c| c.page() == 0xFF01 && c.usage() == 0x0002 && c.feat_len() >= 64) {
        let Some(mut d) = ctx.open_feature_only(&c) else { continue };
        let mut r = Vec::new();
        let mut st = command(&mut *d, 0xB4, 0x00, &mut r);
        if st != 0x01 && st != 0x08 && st != 0x11 {
            // Unexpected status or no answer: probe the dongle and the mouse once, then retry.
            let mut p = Vec::new();
            command(&mut *d, 0x0F, 0x01, &mut p);
            command(&mut *d, 0x0F, 0x0F, &mut p);
            st = command(&mut *d, 0xB4, 0x00, &mut r);
        }
        let awake = st == 0x01 && r[16] <= 100;
        let asleep = st == 0x08 || st == 0x11;
        if !awake && !asleep {
            continue;
        }

        let mut s = DeviceStatus {
            key: format!("endgame:{}", hex4(K_DONGLE_4K)),
            kind: DeviceKind::Mouse,
            via: "2.4 GHz receiver".into(),
            // 08 / 11: the mouse sleeps or is off; shown dimmed with the last known value
            asleep,
            ..Default::default()
        };
        if awake {
            s.percent = r[16] as i32;
            let mut info = Vec::new();
            if command(&mut *d, 0x0E, 0x00, &mut info) == 0x01 && info[16] == 0x67 && info[17] == 0x33 {
                // 0E (mouse info): reply[18..19] = mouse PID, little endian.
                if let Some(n) = mouse_name((info[18] as u16) | ((info[19] as u16) << 8)) {
                    LAST_NAME.lock().unwrap().insert(c.path.clone(), n.into());
                }
            }
        }
        s.name = LAST_NAME.lock().unwrap().get(&c.path).cloned().unwrap_or_else(|| "Endgame Gear 4k wireless mouse".into());
        ctx.add(s, K_VID, K_DONGLE_4K);
        break;
    }
}
