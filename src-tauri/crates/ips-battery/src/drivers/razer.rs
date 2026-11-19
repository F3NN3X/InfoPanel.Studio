//! Razer wireless mice, keyboards and dongles (VID 1532).
//! 90-byte feature report (report id 0):
//!   [0] status  [1] transaction id  [2..3] remaining packets  [4] protocol type  [5] data size
//!   [6] command class  [7] command id  [8..87] arguments  [88] crc (xor of 2..87)  [89] reserved
//! Battery: class 07 id 80 -> args[1] = 0..255. Charging: class 07 id 84 -> args[1] = 1.
//! Reply status: 01 busy, 02 ok, 03 failed, 04 timeout, 05 not supported.
//! Use documented keyboard transaction ids; probe the known ids for other models.
//! Reference: github.com/openrazer/openrazer (protocol documentation in its driver sources).

use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{
    clamp100, guess_kind, hex4, hid_product, kind_from_collections, HidColl, HidIo, PollContext,
};
use crate::win::sleep_ms;

fn keyboard_battery_tid(pid: u16) -> u8 {
    // OpenRazer razerkbd_driver.c: razer_attr_read_charge_level / charge_status.
    match pid {
        // wireless keyboards
        0x025C | 0x0271 | 0x0290 | 0x0296 | 0x02BA | 0x02D2 | 0x02D5 => 0x9F,
        // wired keyboards / Joro
        0x0258 | 0x0292 | 0x0298 | 0x02B9 | 0x02CD | 0x02D4 | 0x02D7 => 0x1F,
        0x025A => 0x3F, // BlackWidow V3 Pro wired
        _ => 0,
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Rz {
    Ok,
    Offline,
    Unsupported,
    NoReply,
}

// The C++ reads the product id off the open device (d.coll().pid) only to pick the retry sleep;
// the Rust HidIo handle carries no collection, so the caller passes the pid in.
fn command(d: &mut dyn HidIo, pid: u16, tid: u8, cls: u8, id: u8, size: u8, args: &mut Vec<u8>) -> Rz {
    let mut rep = vec![0u8; 91]; // [0] = report id 0, then the 90-byte report
    {
        let r = &mut rep[1..];
        r[1] = tid;
        r[5] = size;
        r[6] = cls;
        r[7] = id;
        let mut crc = 0u8;
        for i in 2..88 {
            crc ^= r[i];
        }
        r[88] = crc;
    }
    let mut resp: Vec<u8> = Vec::new();
    let mut send = true;
    let mut res = Rz::NoReply;
    for attempt in 0..8 {
        if send && !d.set_feature(&rep) {
            return Rz::NoReply;
        }
        // Wireless keyboards need about 5 ms (OpenRazer); a long wait lets Synapse replace the reply.
        sleep_ms(if keyboard_battery_tid(pid) != 0 { 5 } else if attempt == 0 { 15 } else { 40 });
        send = true;
        res = Rz::NoReply;
        if !d.get_feature(0, &mut resp) || resp.len() < 91 {
            continue;
        }
        let a = &resp[1..];
        let mut reply_crc = 0u8;
        for i in 2..88 {
            reply_crc ^= a[i];
        }
        // Synapse shares the feature-report mailbox. A different reply needs a fresh request.
        if a[1] != tid
            || a[2] != 0
            || a[3] != 0
            || a[4] != 0
            || a[5] != size
            || a[6] != cls
            || a[7] != id
            || a[88] != reply_crc
        {
            continue;
        }
        if a[0] == 0x01 {
            send = false;
            continue; // busy: wait for this request to finish
        }
        if a[0] == 0x02 {
            *args = a[8..88].to_vec();
            return Rz::Ok;
        }
        if a[0] == 0x04 {
            res = Rz::Offline;
            continue; // retry a transient receiver timeout
        }
        if a[0] == 0x05 || a[0] == 0x03 {
            return Rz::Unsupported;
        }
    }
    res
}

fn clean_name(mut n: String) -> String {
    for suffix in [
        " Dongle",
        " (Wired)",
        " (Wireless)",
        " Wireless Receiver",
        " Receiver",
        " HyperSpeed Dongle",
    ] {
        // C++ strips only when the name is longer than the suffix (never down to an empty string).
        if n.chars().count() > suffix.chars().count() && n.ends_with(suffix) {
            n.truncate(n.len() - suffix.len());
        }
    }
    if n.is_empty() {
        n = "Razer device".into();
    }
    n
}

// Exact keyboard/keypad/laptop and mouse/receiver IDs from OpenRazer (no PID-range assumptions).
// https://github.com/openrazer/openrazer/blob/cd5c4243bfafb08df7e2d2963367c3c150626eac/driver/razerkbd_driver.h
// https://github.com/openrazer/openrazer/blob/cd5c4243bfafb08df7e2d2963367c3c150626eac/driver/razermouse_driver.h
const K_KEYBOARD_PIDS: &[u16] = &[
    0x010D, 0x010E, 0x010F, 0x0111, 0x0113, 0x0118, 0x011A, 0x011B, 0x011C, 0x0201, 0x0202, 0x0203,
    0x0204, 0x0205, 0x0207, 0x0208, 0x0209, 0x020F, 0x0210, 0x0211, 0x0214, 0x0216, 0x0217, 0x021A,
    0x021E, 0x021F, 0x0220, 0x0221, 0x0224, 0x0225, 0x0226, 0x0227, 0x0228, 0x022A, 0x022B, 0x022C,
    0x022D, 0x022F, 0x0232, 0x0233, 0x0234, 0x0235, 0x0237, 0x0239, 0x023A, 0x023B, 0x023F, 0x0240,
    0x0241, 0x0243, 0x0244, 0x0245, 0x0246, 0x024A, 0x024B, 0x024C, 0x024D, 0x024E, 0x0252, 0x0253,
    0x0255, 0x0256, 0x0257, 0x0258, 0x0259, 0x025A, 0x025C, 0x025D, 0x025E, 0x0266, 0x0268, 0x0269,
    0x026A, 0x026B, 0x026C, 0x026D, 0x026E, 0x026F, 0x0270, 0x0271, 0x0276, 0x0279, 0x027A, 0x0282,
    0x0287, 0x028A, 0x028B, 0x028C, 0x028D, 0x028F, 0x0290, 0x0292, 0x0293, 0x0294, 0x0295, 0x0296,
    0x0298, 0x029D, 0x029E, 0x029F, 0x02A0, 0x02A1, 0x02A2, 0x02A3, 0x02A5, 0x02A6, 0x02A7, 0x02B0,
    0x02B6, 0x02B8, 0x02B9, 0x02BA, 0x02C5, 0x02C6, 0x02C7, 0x02CD, 0x02CF, 0x02D2, 0x02D4, 0x02D5,
    0x02D7, 0x02E0, 0x02E1, 0x02EA, 0x0A24,
];

const K_MOUSE_PIDS: &[u16] = &[
    0x0013, 0x0015, 0x0016, 0x001F, 0x0020, 0x0024, 0x0025, 0x0029, 0x002E, 0x002F, 0x0032, 0x0034,
    0x0036, 0x0037, 0x0038, 0x0039, 0x003E, 0x003F, 0x0040, 0x0041, 0x0042, 0x0043, 0x0044, 0x0045,
    0x0046, 0x0048, 0x004C, 0x004F, 0x0050, 0x0053, 0x0054, 0x0059, 0x005A, 0x005B, 0x005C, 0x005E,
    0x005F, 0x0060, 0x0062, 0x0064, 0x0065, 0x0067, 0x006A, 0x006B, 0x006C, 0x006E, 0x006F, 0x0070,
    0x0071, 0x0072, 0x0073, 0x0077, 0x0078, 0x007A, 0x007B, 0x007C, 0x007D, 0x0080, 0x0083, 0x0084,
    0x0085, 0x0086, 0x0088, 0x008A, 0x008C, 0x008D, 0x008F, 0x0090, 0x0091, 0x0094, 0x0095, 0x0096,
    0x0098, 0x0099, 0x009A, 0x009C, 0x009E, 0x009F, 0x00A1, 0x00A3, 0x00A5, 0x00A6, 0x00A7, 0x00A8,
    0x00AA, 0x00AB, 0x00AF, 0x00B0, 0x00B2, 0x00B3, 0x00B4, 0x00B6, 0x00B7, 0x00B8, 0x00B9, 0x00BE,
    0x00BF, 0x00C0, 0x00C1, 0x00C2, 0x00C3, 0x00C4, 0x00C5, 0x00C7, 0x00C8, 0x00CB, 0x00CC, 0x00CD,
    0x00D0, 0x00D1, 0x00D3, 0x00D4, 0x00D6, 0x00D7, 0x00DA, 0x00DB, 0x00DE, 0x00DF, 0x00E0, 0x00E5,
    0x00E6,
];

fn kind(colls: &[HidColl], vid: u16, pid: u16) -> DeviceKind {
    // Both keyboards and mice can expose keyboard AND mouse collections for macros/buttons.
    if vid == 0x1532 {
        if K_KEYBOARD_PIDS.contains(&pid) {
            return DeviceKind::Keyboard;
        }
        if K_MOUSE_PIDS.contains(&pid) {
            return DeviceKind::Mouse;
        }
    }
    kind_from_collections(colls, vid, pid)
}

pub fn poll_razer(ctx: &mut PollContext) {
    let mut seen_names: Vec<String> = Vec::new();
    for (vid, pid) in ctx.products(0x1532) {
        for c in ctx.find(vid, pid, |c| c.feat_len() == 91) {
            let Some(mut d) = ctx.open_feature_only(&c) else { continue };
            let mut res = Rz::NoReply;
            let mut tid = 0u8;
            let mut args: Vec<u8> = Vec::new();
            let mut saw_offline = false;
            let keyboard_tid = keyboard_battery_tid(pid);
            let tids: Vec<u8> = if keyboard_tid != 0 {
                vec![keyboard_tid]
            } else {
                vec![0x1F, 0x3F, 0xFF, 0x08, 0x9F]
            };
            for t in tids {
                let r = command(&mut d, pid, t, 0x07, 0x80, 0x02, &mut args);
                if r == Rz::Ok {
                    res = r;
                    tid = t;
                    break;
                }
                saw_offline |= r == Rz::Offline; // may also mean "wrong transaction id": keep trying
            }
            if res != Rz::Ok && saw_offline {
                res = Rz::Offline;
            }
            if res != Rz::Ok && res != Rz::Offline {
                continue;
            }

            let mut s = DeviceStatus::default();
            s.key = format!("razer:{}", hex4(pid));
            s.name = clean_name(hid_product(&c));
            s.kind = kind(&ctx.colls, vid, pid);
            if s.kind == DeviceKind::Other {
                s.kind = guess_kind(&s.name);
            }
            s.via = "Razer receiver".into();
            s.grace_sec = 120; // retain the last reading briefly when Synapse prevents a valid reply
            if res == Rz::Offline {
                s.connected = false;
            } else {
                s.percent = clamp100(((args[1] as i32) * 100 + 127) / 255);
                let mut ch: Vec<u8> = Vec::new();
                if command(&mut d, pid, tid, 0x07, 0x84, 0x02, &mut ch) == Rz::Ok {
                    s.charging = ch[1] == 1;
                }
            }
            // A wireless mouse plugged in for charging shows up twice (cable + dongle); keep one.
            let dup = seen_names.iter().any(|n| *n == s.name);
            if !dup {
                seen_names.push(s.name.clone());
                ctx.add(s, vid, pid);
            } else {
                ctx.claim(vid, pid);
                for o in &mut ctx.out {
                    if o.name == s.name && s.charging {
                        o.charging = true;
                    }
                }
            }
            break;
        }
    }
}
