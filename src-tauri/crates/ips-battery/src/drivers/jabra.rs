//! Jabra headsets behind a Jabra Link 380 / 390 dongle: Jabra's GNP protocol on the vendor collection
//! with usage page FF00 (report 05, 64 bytes).
//!   query: [05][dst][src 00][seq][40|len][class][op][payload]     len = bytes after the report id
//!   reply: [05][dst 00][src][seq][C0|len][class][op][payload]     class FE = NAK
//! Addresses: 01 = the dongle itself, 04 = the headset behind it.
//! Battery = class 12 / op 02 (STATUS__HS_BATTERY), reply payload [flags][level]; flags bit 0 = charging,
//! bit 7 = per-unit levels follow (earbuds), the level byte is then the combined value.
//! Name = class 02 / op 00, reply payload [n][n bytes UTF-8].
//! A switched-off headset gets a NAK (or no reply) while the dongle stays present.
//! Protocol from github.com/Watchdog0x/jabridge (cmd/jabridge/jabraApi.go); verified on a
//! Link 390 (0B0E:2E51) with an Evolve3 75.

use std::collections::BTreeMap;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU8, Ordering};

use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{HidIo, PollContext, hex4};
use crate::win::now_ms;

const JABRA: u16 = 0x0B0E;
const HEADSET: u8 = 0x04;

#[derive(Clone, Copy, PartialEq, Eq)]
enum Reply {
    Ok,
    Nak,
    None,
}

// C++ function-local `static BYTE seq`: the GNP sequence counter, kept across polls.
static SEQ: AtomicU8 = AtomicU8::new(0x20);

// Headset name per dongle: asked once while connected (a failed ask caches the generic name),
// forgotten when the headset goes offline so a newly paired headset is picked up.
// C++ function-local `static std::map<USHORT, std::wstring> names`.
static NAMES: Mutex<BTreeMap<u16, String>> = Mutex::new(BTreeMap::new());

fn query(d: &mut dyn HidIo, dst: u8, cls: u8, op: u8, payload: &mut Vec<u8>, timeout_ms: u32) -> Reply {
    let s = SEQ.fetch_add(1, Ordering::Relaxed);
    d.flush();
    if !d.write(&[0x05, dst, 0x00, s, 0x46, cls, op], 300) {
        return Reply::None;
    }
    let end = now_ms() + timeout_ms as u64;
    let mut r = Vec::new();
    while (end as i64 - now_ms() as i64) > 0 {
        let left = (end as i64 - now_ms() as i64) as i32;
        let n = d.read(&mut r, left as u32);
        if n < 0 {
            return Reply::None;
        }
        if n < 6 {
            continue;
        } // unrelated short report
        if r[0] != 0x05 || r[1] != 0x00 || r[2] != dst || r[3] != s || (r[4] & 0xC0) != 0xC0 {
            continue;
        }
        if r[5] == 0xFE {
            return Reply::Nak;
        } // class FE = NAK
        let len = (r[4] & 0x3F) as i32; // counts from r[1]
        if r.len() < 7 || r[5] != cls || r[6] != op || len < 6 || len as usize + 1 > r.len() {
            continue;
        }
        payload.clear();
        payload.extend_from_slice(&r[7..(len + 1) as usize]);
        return Reply::Ok;
    }
    Reply::None
}

fn headset_name(d: &mut dyn HidIo) -> String {
    let mut p = Vec::new();
    if query(d, HEADSET, 0x02, 0x00, &mut p, 400) != Reply::Ok || p.is_empty() || p[0] == 0 || p[0] as usize + 1 > p.len() {
        return String::new();
    }
    // Payload [n][n bytes UTF-8]; C++ MultiByteToWideChar(CP_UTF8) fails on invalid UTF-8,
    // so an invalid name decodes to nothing.
    String::from_utf8(p[1..1 + p[0] as usize].to_vec()).unwrap_or_default()
}

pub fn poll_jabra(ctx: &mut PollContext) {
    // Link 380a / 380c and 390 USB-A / USB-C, UC and MS variants (product ids from Jabra Direct's
    // DeviceInfo.xml; all share the dongle at GNP address 1 and the same firmware generation).
    for pid in [0x24C7u16, 0x24C8, 0x24C9, 0x24CA, 0x24E9, 0x2E50, 0x2E51, 0x2E56, 0x2E57] {
        if ctx.is_claimed(JABRA, pid) {
            continue;
        }
        for c in ctx.find(JABRA, pid, |c| c.page() == 0xFF00 && c.out_len() >= 64 && c.in_len() >= 64) {
            let Some(mut d) = ctx.open(&c) else { continue };
            let mut p = Vec::new();
            let rep = query(d.as_mut(), HEADSET, 0x12, 0x02, &mut p, 700);
            if rep == Reply::None || (rep == Reply::Ok && p.len() < 2) {
                continue;
            }
            let mut s = DeviceStatus {
                key: format!("jabra:{}", hex4(pid)),
                kind: DeviceKind::Headset,
                via: "Jabra Link dongle".into(),
                ..Default::default()
            };
            if rep == Reply::Ok {
                s.percent = if p[1] <= 100 { p[1] as i32 } else { -1 };
                s.charging = (p[0] & 0x01) != 0;
                let mut names = NAMES.lock().unwrap();
                if !names.contains_key(&pid) {
                    let n = headset_name(d.as_mut());
                    names.insert(pid, if n.is_empty() { "Jabra headset".to_string() } else { n });
                }
                s.name = names.get(&pid).cloned().unwrap();
            } else {
                s.connected = false; // NAK: dongle present, headset off or out of range
                let mut names = NAMES.lock().unwrap();
                s.name = match names.get(&pid) {
                    Some(n) => n.clone(),
                    None => "Jabra headset".to_string(),
                };
                names.remove(&pid);
            }
            ctx.add(s, JABRA, pid);
            break;
        }
    }
}
