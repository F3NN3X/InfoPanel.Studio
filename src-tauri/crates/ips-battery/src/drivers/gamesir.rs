//! GameSir Nova Lite / Nova 2 / Nova 2 Lite on the 2.4 GHz receiver (3537:1098) or a USB cable.
//! XInput reports these as a wired pad, so the battery is read from the vendor collection
//! (usage page FF7A, 64-byte reports, no report ID) with the "device info" query GameSir's own
//! client uses:
//!   Request: 01 01
//!   Reply:   [0]=01, [1..5] receiver address, [10..11] receiver firmware, [18] battery:
//!            0..100 percent, FF = charging (no percentage while on the cable)
//! Unsolicited "F4 00" state frames arrive on the same collection and are skipped.
//! Protocol reference: github.com/WWWyyy452/GamesirBatteryTray and
//! github.com/AJAY0406/Gamesir-Nova-2-Lite-Battery-Detection (both MIT).
//!
//! Cyclone 2 (3537:100B, XInput mode, 2.4 GHz receiver or cable): XInput reports it as wired, so the
//! battery is read from the vendor collection FFF0:0040 (64-byte reports, ids 0F out / 12 in):
//!   Request: 0F 03 (read-only; it makes the pad stream state frames)
//!   Reply:   input report 12: [35] = cable/charging flag, [36] = battery percent (0..100)
//! Protocol reference: github.com/vdemonchy/cyclone2-linux (docs/protocol.md); confirmed on a real
//! Cyclone 2 (the level was read while on battery).

use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{PollContext, hex4};
use crate::win::now_ms;

const VID: u16 = 0x3537;

// 1098: receiver with a controller linked (it re-enumerates under another id when the pad is off).
// 100F: Nova 2 Lite on a cable.
// 1040: Nova Lite 2 receiver (issue #47, same FF7A collection; untested).
fn is_nova(pid: u16) -> bool {
    pid == 0x1098 || pid == 0x100F || pid == 0x1040
}

// 100B: Cyclone 2 with the controller linked or on a cable (the receiver is 0575 while no pad is on).
fn is_cyclone2(pid: u16) -> bool {
    pid == 0x100B
}

pub fn poll_gamesir(ctx: &mut PollContext) {
    for &(vid, pid) in &ctx.products(VID) {
        if !is_nova(pid) {
            continue;
        }
        for c in ctx.find(vid, pid, |c| c.page() == 0xFF7A && c.out_len() >= 3) {
            let Some(mut d) = ctx.open(&c) else { continue };
            d.flush();
            if !d.write(&[0x00, 0x01, 0x01], 500) {
                continue;
            }
            let mut r: Vec<u8> = Vec::new();
            let mut found = false;
            let end = now_ms() + 800;
            while !found && (end as i64 - now_ms() as i64) > 0 {
                if d.read(&mut r, 200) < 19 {
                    continue;
                }
                if r[0] != 0x01 {
                    continue;
                } // state frame (F4 00 ...) or anything else
                found = true;
            }
            if !found || (r[18] > 100 && r[18] != 0xFF) {
                continue;
            }
            let mut s = DeviceStatus::default();
            s.key = format!("gamesir:{}", hex4(pid));
            s.name = "GameSir Nova".into();
            s.kind = DeviceKind::Gamepad;
            let via = if pid == 0x100F { "USB cable" } else { "2.4 GHz receiver" };
            s.via = via.into();
            if r[18] == 0xFF {
                s.charging = true; // percent stays -1: the last known value is kept
            } else {
                s.percent = r[18] as i32;
            }
            ctx.add(s, vid, pid);
            break;
        }
    }
}

pub fn poll_gamesir_cyclone(ctx: &mut PollContext) {
    for &(vid, pid) in &ctx.products(VID) {
        if !is_cyclone2(pid) {
            continue;
        }
        for c in ctx.find(vid, pid, |c| c.page() == 0xFFF0 && c.usage() == 0x0040 && c.out_len() >= 3 && c.in_len() >= 37) {
            let Some(mut d) = ctx.open(&c) else { continue };
            d.flush();
            if !d.write(&[0x0F, 0x03], 500) {
                continue;
            }
            let mut r: Vec<u8> = Vec::new();
            let mut found = false;
            let end = now_ms() + 1500;
            while !found && (end as i64 - now_ms() as i64) > 0 {
                if d.read(&mut r, 200) < 37 {
                    continue;
                }
                found = r[0] == 0x12 && r[36] <= 100; // the 0x10 event reports carry no battery
            }
            if !found {
                continue;
            }
            let mut s = DeviceStatus::default();
            s.key = format!("gamesir:{}", hex4(pid));
            s.name = "GameSir Cyclone 2".into();
            s.kind = DeviceKind::Gamepad;
            s.via = "2.4 GHz receiver or USB".into();
            s.percent = r[36] as i32;
            s.charging = r[35] == 1;
            ctx.add(s, vid, pid);
            break;
        }
    }
}
