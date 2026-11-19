//! 8BitDo Ultimate 2 Wireless (VID 2DC8) in D-input mode: 2.4 GHz dongle, USB cable or Bluetooth,
//! all as 2DC8:6012. Firmware 1.03 and later send a 34-byte gamepad input report 01 that carries
//! the battery in byte 14: bits 0-6 = percent, bit 7 = charging. Nothing is sent to the pad.
//! Layout reference: SDL, src/joystick/hidapi/SDL_hidapi_8bitdo.c (HandleStatePacket). Confirmed on
//! a real pad on the dongle, on battery at 99%: "01 0F 7F 7F 7F 7F 00 .. 00 63 E0 FD ..." (byte 14 = 63).
//!
//! In X-input mode (dongle 2DC8:310B) the dongle tells XInput the pad is wired and full, and its
//! vendor collection (FF7A) stays silent, so no level is available there: the pad has to be switched
//! to D-input mode (hold B while turning it on) to be shown.

use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{hex4, PollContext};
use crate::win::now_ms;

const VID: u16 = 0x2DC8;
const REPORT_LEN: i32 = 34;  // v1.02 firmware sends 12-byte reports without the battery byte

fn is_ultimate2(pid: u16) -> bool { pid == 0x6012 }

pub fn poll_8bitdo(ctx: &mut PollContext) {
    for &(vid, pid) in &ctx.products(VID) {
        if !is_ultimate2(pid) { continue; }
        for c in ctx.find(vid, pid, |c| c.page() == 0x01 && c.usage() == 0x05 && c.in_len() as i32 >= REPORT_LEN) {
            // games keep the gamepad open; reading alongside them is fine
            let Some(mut d) = ctx.open_read_only(&c) else { continue };
            let mut r: Vec<u8> = Vec::new();
            let mut found = false;
            let end = now_ms() + 600;  // the pad streams reports every few ms while linked
            while !found && (end as i64 - now_ms() as i64) > 0 {
                found = d.read(&mut r, 100) >= REPORT_LEN && r[0] == 0x01 && (r[14] & 0x7F) <= 100;
            }
            if !found { continue; }
            let mut s = DeviceStatus::default();
            s.key = format!("8bitdo:{}", hex4(pid));
            s.name = "8BitDo Ultimate 2".into();
            s.kind = DeviceKind::Gamepad;
            // Bluetooth HID paths carry the HID service class id 00001124-...
            let via = if c.path.contains("00001124") { "Bluetooth" } else { "2.4 GHz dongle or USB" };
            s.via = via.into();
            s.percent = (r[14] & 0x7F) as i32;
            s.charging = (r[14] & 0x80) != 0 && s.percent < 100;
            ctx.add(s, vid, pid);
            break;
        }
    }
}
