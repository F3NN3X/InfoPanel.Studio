//! Fractal Design Scape headset (VID 36BC): 2.4 GHz dongle (PID 0001) or the headset itself on its
//! USB-C cable (PID 2001). Both expose a 64-byte vendor collection on usage page FF00 / usage 01.
//!
//! Requests are output report 0x02: [0x02][device type][command]. The reply is an input report 0x02
//! echoing the device type and command, followed by the payload.
//!   GET_DEVICE_STATE = 0x21, sent to device type 0x11 (dongle) or 0xF1 (headset).
//!   Dongle reply:  payload byte 3 = 1 when the headset is linked to it.
//!   Headset reply: payload byte 14 = battery level in percent. Through the dongle the request is
//!                  relayed to the headset over the air; on the cable it is answered directly.
//! Byte offsets count from the device type (WebHID's DataView, which excludes the report id), so the
//! hidapi-style buffer below is shifted by one.
//!
//! Source: Fractal's own WebHID configurator, Adjust Pro (adjust.fractal-design.com): classes
//! BTDongle / Headset, getUpdatedDeviceState(), constants P911.REPORT_ID = 2,
//! DEVICE_TYPE_FACTORY_DONGLE = 17, DEVICE_TYPE_FACTORY_HEADSET = 241, GET_DEVICE_STATE_CMD = 33.
//! Adjust Pro does not read a charging flag. Payload byte 22 reads 1 with the headset on its USB cable
//! and 0 over the air (checked on a Scape, firmware as shipped in 2026); it is used as the charging bit.
//! The headset unlinks from the dongle while it sits on its charging stand, so it then shows as off.

use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{HidIo, PollContext};
use crate::win::now_ms;

const REPORT_ID: u8 = 0x02;
const TYPE_DONGLE: u8 = 0x11;
const TYPE_HEADSET: u8 = 0xF1;
const GET_DEVICE_STATE: u8 = 0x21;

// Sends GET_DEVICE_STATE to `dev_type` and waits for its reply (one absolute 1 s deadline).
fn get_state(d: &mut dyn HidIo, dev_type: u8, r: &mut Vec<u8>) -> bool {
    d.flush();
    if !d.write(&[REPORT_ID, dev_type, GET_DEVICE_STATE], 500) { return false; }
    let end = now_ms() + 1000;
    loop {
        let left = (end as i64 - now_ms() as i64) as i32;
        if left <= 0 { return false; }
        let n = d.read(r, left as u32);
        if n < 0 { return false; }
        if n >= 24 && r[0] == REPORT_ID && r[1] == dev_type && r[2] == GET_DEVICE_STATE { return true; }
    }
}

pub fn poll_fractal(ctx: &mut PollContext) {
    for &(vid, pid) in &ctx.products(0x36BC) {
        if pid != 0x0001 && pid != 0x2001 { continue; }
        let cable = pid == 0x2001;
        for c in ctx.find(vid, pid, |c| c.page() == 0xFF00 && c.usage() == 0x0001 && c.out_len() >= 4 && c.in_len() >= 24) {
            let Some(mut d) = ctx.open(&c) else { continue };
            let mut s = DeviceStatus::default();
            s.key = "fractal:scape".into();  // same entry on the dongle and on the cable
            s.name = "Fractal Scape".into();
            s.kind = DeviceKind::Headset;
            let via = if cable { "USB cable" } else { "2.4 GHz dongle" };
            s.via = via.into();
            let mut r: Vec<u8> = Vec::new();
            if !cable {
                if !get_state(&mut *d, TYPE_DONGLE, &mut r) { continue; }
                if r[4] != 1 {  // dongle answers, headset off, out of range or on its stand
                    s.connected = false;
                    ctx.add(s, vid, pid);
                    break;
                }
            }
            if !get_state(&mut *d, TYPE_HEADSET, &mut r) || r[15] > 100 { continue; }
            s.percent = r[15] as i32;
            s.charging = r[23] == 1;
            ctx.add(s, vid, pid);
            break;
        }
    }
}
