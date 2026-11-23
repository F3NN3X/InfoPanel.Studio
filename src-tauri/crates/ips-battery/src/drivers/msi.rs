//! MSI VERSA 300 ELITE WIRELESS on its 2.4 GHz dongle (0DB0:9E22), vendor collection FF0D:00B0
//! (interface 1, 65-byte input/output reports).
//! Protocol taken from MSI Center's own Gaming Gear module (Class_Mouse_VERSA300Elite, dongle
//! branch of GetBattery) and checked against a real mouse:
//!   Output report (report ID 0, 64-byte payload zero-padded): [00][0F 20 00 ...]
//!   Input reply (after stripping the leading 0 report ID):
//!     [0] = 0F, [1] = 20, [14] = battery: bit 7 = charging, bits 0..6 = percent (0..100)
//! A level of 0 while not charging is treated as "asleep" and the last known value is kept: MSI
//! Center's log shows readings of 0 between normal ones, most likely while the mouse is off or asleep.
//! MSI Center also sends 41 80 ("remote control") first. That switches the mouse into a software
//! control mode, so it is deliberately not sent here: the 0F 20 query is enough.

use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{HidColl, HidIo, PollContext, hex4, hid_product};
use crate::win::now_ms;

const MSI_VID: u16 = 0x0DB0;
const VERSA300_ELITE_DONGLE_PID: u16 = 0x9E22;

fn query_versa300_elite(ctx: &mut PollContext, c: &HidColl, percent: &mut i32, charging: &mut bool) -> bool {
    let Some(mut d) = ctx.open(c) else { return false };
    d.flush();
    if !d.write(&[0x00, 0x0F, 0x20], 500) {
        return false;
    }

    let mut r: Vec<u8> = Vec::new();
    let end = now_ms() + 1000;
    while (end as i64 - now_ms() as i64) > 0 {
        let left = (end as i64 - now_ms() as i64) as i32;
        let n = d.read(&mut r, left as u32);
        if n < 0 {
            break;
        }
        if n >= 15 && r[0] == 0x0F && r[1] == 0x20 {
            let level = (r[14] & 0x7F) as i32;
            if level > 100 {
                return false;
            }
            *percent = level;
            *charging = (r[14] & 0x80) != 0;
            return true;
        }
    }
    false
}

pub fn poll_msi(ctx: &mut PollContext) {
    if ctx.is_claimed(MSI_VID, VERSA300_ELITE_DONGLE_PID) {
        return;
    }
    for c in ctx.find(MSI_VID, VERSA300_ELITE_DONGLE_PID, |c| {
        c.iface == 1 && c.page() == 0xFF0D && c.usage() == 0x00B0 && c.out_len() >= 65 && c.in_len() >= 65
    }) {
        let mut pct = -1;
        let mut chg = false;
        if !query_versa300_elite(ctx, &c, &mut pct, &mut chg) {
            continue;
        }

        let mut s = DeviceStatus {
            key: format!("msi:{}", hex4(VERSA300_ELITE_DONGLE_PID)),
            name: hid_product(&c),
            kind: DeviceKind::Mouse,
            via: "2.4 GHz receiver".into(),
            grace_sec: 1800,
            ..Default::default()
        };
        if s.name.is_empty() {
            s.name = "MSI VERSA 300 ELITE WIRELESS".into();
        }
        if pct == 0 && !chg {
            s.asleep = true;
        } else {
            s.percent = pct;
            s.charging = chg;
        }
        ctx.add(s, MSI_VID, VERSA300_ELITE_DONGLE_PID);
        break;
    }
}
