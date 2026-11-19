//! Sony DualShock 4 / DualSense / DualSense Edge (VID 054C), USB or Bluetooth.
//! The battery is part of the regular input report:
//!   DualShock 4: USB report 01 byte 30, Bluetooth report 11 byte 32: bits 0-3 level, bit 4 cable
//!   DualSense:   USB report 01 byte 53, Bluetooth report 31 byte 54: bits 0-3 level (0-10), bits 4-7 state
//! Over Bluetooth both controllers send a reduced report until a feature report is read, so we read
//! the calibration report (05) once, which is what games do too.
//! Layout reference: Linux drivers/hid/hid-playstation.c.

use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{clamp100, hex4, PollContext};
use crate::win::now_ms;

fn is_ds4(pid: u16) -> bool { pid == 0x05C4 || pid == 0x09CC || pid == 0x0BA0 }
fn is_dualsense(pid: u16) -> bool { pid == 0x0CE6 || pid == 0x0DF2 }

pub fn poll_playstation(ctx: &mut PollContext) {
    for c in ctx.colls.clone() {
        if c.vid != 0x054C || !(is_ds4(c.pid) || is_dualsense(c.pid)) { continue; }
        if c.page() != 0x01 || c.usage() != 0x05 { continue; }  // the gamepad collection
        let Some(mut d) = ctx.open(&c) else { continue };
        let bt = c.in_len() > 64;
        if bt {
            let mut f = Vec::new();
            d.get_feature(0x05, &mut f);  // switches the controller to full reports
        }
        let mut r: Vec<u8> = Vec::new();
        let mut pct: i32 = -1;
        let mut charging = false;
        let mut found = false;
        let end = now_ms() + 500;
        while !found && (end as i64 - now_ms() as i64) > 0 {
            if d.read(&mut r, 100) < 10 { continue; }
            if is_ds4(c.pid) {
                let at: usize = if r[0] == 0x01 { 30 } else if r[0] == 0x11 { 32 } else { 0 };
                if at == 0 || r.len() <= at || (r[0] == 0x01 && bt) { continue; }
                let level = (r[at] & 0x0F) as i32;
                let cable = (r[at] & 0x10) != 0;
                if c.pid == 0x0BA0 && r[at] == 0 { break; }  // wireless adapter without a controller
                pct = if cable { if level >= 11 { 100 } else { clamp100(level * 10) } }
                      else { clamp100(level * 10 + 5) };
                charging = cable && level < 11;
                found = true;
            } else {
                let at: usize = if r[0] == 0x01 { 53 } else if r[0] == 0x31 { 54 } else { 0 };
                if at == 0 || r.len() <= at || (r[0] == 0x01 && bt) { continue; }
                let level = (r[at] & 0x0F) as i32;
                let state = r[at] >> 4;
                pct = clamp100(level * 10 + 5);
                charging = state == 0x1;
                if state == 0x2 { pct = 100; charging = true; }
                found = true;
            }
        }
        if !found { continue; }
        let mut s = DeviceStatus::default();
        let mut h: u32 = 2166136261;
        for ch in c.path.encode_utf16() { h ^= ch as u32; h = h.wrapping_mul(16777619); }
        s.key = format!("ps:{}:{}", hex4(c.pid), h);
        s.name = if is_ds4(c.pid) { "DualShock 4" }
            else if c.pid == 0x0DF2 { "DualSense Edge" }
            else { "DualSense" }.into();
        s.kind = DeviceKind::Gamepad;
        s.via = if bt { "Bluetooth" } else if c.pid == 0x0BA0 { "Wireless adapter" } else { "USB cable" }.into();
        s.percent = pct;
        s.charging = charging;
        ctx.out.push(s);
        ctx.claim(c.vid, c.pid);
    }
}
