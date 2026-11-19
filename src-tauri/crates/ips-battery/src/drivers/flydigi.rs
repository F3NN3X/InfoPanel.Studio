//! Flydigi Vader 5 Pro (37D7:2401), vendor collection FFA0:0001.
//! Protocol reference: SDL/src/joystick/hidapi/SDL_hidapi_flydigi.c and
//! https://github.com/HeyOkay/HaloBattery/issues/191 (Windows hardware traces).
//! Only architecture/info queries are sent; no controller takeover or configuration writes.

use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{hex4, HidIo, PollContext};
use crate::win::now_ms;

const VID: u16 = 0x37D7;
const PID: u16 = 0x2401;

fn reply(d: &mut dyn HidIo, command: u8, out: &mut Vec<u8>) -> bool {
    let end = now_ms() + 800;
    while now_ms() < end {
        let remaining = (end as i64 - now_ms() as i64) as i32;
        if remaining <= 0 || d.read(out, remaining as u32) < 0 { return false; }
        // HidDev strips a zero report ID. Some firmware retains a numbered input ID.
        if out.len() >= 4 && out[0] == 0x04 && out[1] == 0x5A && out[2] == 0xA5 { out.remove(0); }
        if out.len() >= 5 && out[0] == 0x5A && out[1] == 0xA5 && out[2] == command { return true; }
    }
    false
}

pub fn poll_flydigi(ctx: &mut PollContext) {
    if ctx.is_claimed(VID, PID) { return; }
    for c in ctx.find(VID, PID, |c| c.page() == 0xFFA0 && c.usage() == 1 && c.in_len() >= 12 && c.out_len() >= 6) {
        let Some(mut d) = ctx.open(&c) else { continue };
        d.flush();
        let mut r: Vec<u8> = Vec::new();
        // Vader 5 Pro uses an unnumbered output report, unlike Apex 5's report 03.
        if !d.write(&[0x00, 0x5A, 0xA5, 0x07, 0x00, 0x00], 500) { continue; }
        let modern = reply(&mut *d, 0x07, &mut r) && r[3] == 1 && r[4] == 0;
        if !d.write(&[0x00, 0x5A, 0xA5, 0x01, 0x02, 0x00], 500) || !reply(&mut *d, 0x01, &mut r) { continue; }
        if r.len() < 12 || r[5] != 130 { continue; }  // confirmed Vader 5 Pro identity
        let level = (r[11] & 0x0F) as i32;
        let state = (r[11] >> 4) as i32;
        if state > 2 || level > 5 { continue; }
        let connection = r[6] as i32;
        let wrong_connection = if modern { connection > 1 } else { connection != 1 && connection != 2 };
        if wrong_connection { continue; }
        let mut s = DeviceStatus::default();
        s.key = format!("flydigi:{}:{}:{}", hex4(c.vid), hex4(c.pid), c.iface);
        s.name = "Flydigi Vader 5 Pro".into();
        s.kind = DeviceKind::Gamepad;
        let receiver_conn = if modern { 1 } else { 2 };
        let via = if connection == receiver_conn { "2.4 GHz receiver" } else { "USB cable" };
        s.via = via.into();
        s.percent = if state == 2 { 100 } else { level * 20 };
        s.charging = state == 1;
        ctx.add(s, VID, PID);
    }
}
