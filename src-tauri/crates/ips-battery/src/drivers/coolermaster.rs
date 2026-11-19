//! Cooler Master wireless mice (VID 2516): MM712 (cable 0169) and MM731 (cable 0167). Both pair with
//! the same "Cooler Master Mice Dongle" (01B7). Vendor interface 3, usage page FF0A, no report id;
//! 32-byte reports on the dongle, 64-byte reports over the cable.
//!   Request: [46][81][00] -> status report [47][81][model] ... [10] percent, [11] charging (0 = no),
//!            [12] link (0 cable, 1 dongle). The mouse also sends it on its own when the level changes.
//!   [2] tells the models apart on the shared dongle: 50 = MM712; 70 seen in an MM731 status report.
//!   A sleeping or switched-off mouse does not answer; the last value is kept (grace_sec).
//! MM712 verified on hardware (2516:01B7). MM731: same protocol family per MM731-Controller; its battery
//! bytes and model byte are not verified.
//! Protocol: github.com/syntactic-spice/coolermaster-usb-protocol (docs/PROTOCOL.md) and
//! github.com/riVFerd/MM731-Controller.

use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{hex4, HidIo, PollContext};
use crate::win::now_ms;

const DONGLE: u16 = 0x01B7;
const MM712_CABLE: u16 = 0x0169;
const MM731_CABLE: u16 = 0x0167;

fn model_name(pid: u16, model: u8) -> &'static str {
    if pid == MM712_CABLE || (pid == DONGLE && model == 0x50) { return "Cooler Master MM712"; }
    if pid == MM731_CABLE || (pid == DONGLE && model == 0x70) { return "Cooler Master MM731"; }
    "Cooler Master wireless mouse"
}

// Sends the status request and waits for the 47 81 reply.
fn query_status(d: &mut dyn HidIo, r: &mut Vec<u8>) -> bool {
    d.flush();
    if !d.write(&[0x00, 0x46, 0x81, 0x00], 500) { return false; }
    let end = now_ms() + 500;
    loop {
        let left = (end as i64 - now_ms() as i64) as i32;
        if left <= 0 || d.read(r, left as u32) < 13 { return false; }
        if r[0] == 0x47 && r[1] == 0x81 { return true; }
    }
}

pub fn poll_coolermaster(ctx: &mut PollContext) {
    for &(vid, pid) in &ctx.products(0x2516) {  // sorted: the cable ids come before the dongle
        if pid != DONGLE && pid != MM712_CABLE && pid != MM731_CABLE { continue; }
        for c in ctx.find(vid, pid, |c| c.iface == 3 && c.page() == 0xFF0A) {
            let Some(mut d) = ctx.open(&c) else { continue };
            let mut r = Vec::new();
            if !query_status(d.as_mut(), &mut r) { continue; }
            let mut s = DeviceStatus::default();
            s.key = format!("coolermaster:{}", hex4(pid));
            s.name = model_name(pid, r[2]).into();
            s.kind = DeviceKind::Mouse;
            s.via = if r[12] == 0 { "USB cable" } else { "2.4 GHz receiver" }.into();
            if r[10] >= 1 && r[10] <= 100 { s.percent = r[10] as i32; }
            s.charging = r[11] != 0;
            s.grace_sec = 1800;
            // With the cable and the dongle both plugged in the mouse shows up twice; keep one.
            let mut dup = false;
            for o in ctx.out.iter_mut() {
                if o.name != s.name { continue; }
                dup = true;
                o.charging |= s.charging;
            }
            if dup { ctx.claim(vid, pid); }
            else { ctx.add(s, vid, pid); }
            break;
        }
    }
}
