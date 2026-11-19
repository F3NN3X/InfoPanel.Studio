//! Valve Steam Controller battery input reports. Layout reference: Linux hid-steam.

use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{hex4, hid_product, HidIo, PollContext};
use crate::win::now_ms;

fn steam_controller_transport(pid: u16) -> Option<&'static str> {
    match pid {
        0x1142 => Some("Wireless adapter"),  // 2015 receiver
        0x1302 => Some("USB cable"),
        0x1303 => Some("Bluetooth"),
        0x1304 |  // 2026 puck
        0x1305 => Some("Wireless adapter"),  // internal receiver
        _ => None,
    }
}

fn read_steam_battery(dev: &mut dyn HidIo, legacy: bool, puck: bool, status: &mut DeviceStatus) -> bool {
    let mut report = Vec::new();
    // The puck exposes four slots even when fewer controllers are connected.
    let mut received_input = false;
    let deadline = now_ms() + 5000;
    while now_ms() < deadline {
        // Windows pads numbered input reports to the collection's maximum size.
        let size = dev.read(&mut report, if puck && !received_input { 250 } else { 100 });
        if size < 0 && puck && !received_input { return false; }
        if size > 0 { received_input = true; }
        if size < 15 { continue; }
        if legacy {
            if report[0] != 0x01 || report[1] != 0x00 || report[2] != 0x04 ||
               report[3] != 11 || report[14] > 100 {
                continue;
            }
            status.percent = report[14] as i32;
        } else {
            if report[0] != 0x43 || report[2] > 100 { continue; }
            status.percent = report[2] as i32;
            status.charging = report[1] == 2;
        }
        return true;
    }
    false
}

pub fn poll_steam_controller(ctx: &mut PollContext) {
    for c in ctx.colls.clone() {
        if c.vid != 0x28DE || c.page() != 0xFF00 || c.in_len() < 15 { continue; }
        let Some(transport) = steam_controller_transport(c.pid) else { continue };
        let puck = c.pid == 0x1304;
        if puck && c.usage() != 0x01 { continue; }  // skip the charging contacts collection

        let Some(mut dev) = ctx.open(&c) else { continue };
        let mut status = DeviceStatus::default();
        let legacy = c.pid == 0x1142;
        if !read_steam_battery(dev.as_mut(), legacy, puck, &mut status) { continue; }

        let mut hash: u32 = 2166136261;
        for ch in c.path.encode_utf16() { hash ^= ch as u32; hash = hash.wrapping_mul(16777619); }
        status.key = format!("steam:{}:{}", hex4(c.pid), hash);
        status.name = hid_product(&c);
        if legacy || puck || c.pid == 0x1305 || status.name.is_empty() {
            status.name = "Steam Controller".into();
        }
        status.kind = DeviceKind::Gamepad;
        status.via = transport.into();
        ctx.add(status, c.vid, c.pid);
    }
}
