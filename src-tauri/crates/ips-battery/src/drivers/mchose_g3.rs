//! MCHOSE wireless mice (VID 3837). Currently supports the MCHOSE G3 V2 (2.4 GHz receiver
//! 3837:4245 and USB cable 3837:418C) on vendor collection FF01:0010 (65-byte input/output reports).
//! Protocol from github.com/Jstdi001/MCHOSE-Monitor (MIT), verified on MCHOSE G3 V2:
//!   Output report (report ID 0, 64-byte payload zero-padded):
//!     [00][55 30 A5 0B 2E 01 01 01 00 00 ...]
//!   Input reply (after stripping leading 0 report ID):
//!     [0] = AA, [1] = 30, [8] = percent (1..100), [9] = charging (1 = charging)

use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{hid_product, HidColl, PollContext};
use crate::win::now_ms;

const MCHOSE_VID: u16 = 0x3837;
const G3V2_WIRED_PID: u16 = 0x418C;
const G3V2_WIRELESS_PID: u16 = 0x4245;

fn query_g3v2(ctx: &mut PollContext, c: &HidColl, percent: &mut i32, charging: &mut bool) -> bool {
    let Some(mut d) = ctx.open(c) else { return false };
    d.flush();
    // The C++ Write used its default timeout of 500 ms.
    if !d.write(&[0x00, 0x55, 0x30, 0xA5, 0x0B, 0x2E, 0x01, 0x01, 0x01, 0x00, 0x00], 500) {
        return false;
    }

    let mut r = Vec::new();
    let end = now_ms() + 1000;
    while (end as i64 - now_ms() as i64) > 0 {
        let left = (end as i64 - now_ms() as i64) as i32;
        let n = d.read(&mut r, left as u32);
        if n < 0 { break; }
        if n >= 10 && r[0] == 0xAA && r[1] == 0x30 {
            if r[8] < 1 || r[8] > 100 { return false; }
            *percent = r[8] as i32;
            *charging = r[9] == 1;
            return true;
        }
    }
    false
}

pub fn poll_mchose_g3(ctx: &mut PollContext) {
    // Prefer wired over 2.4 GHz when both are connected at the same time.
    let mut found = false;
    for &pid in &[G3V2_WIRED_PID, G3V2_WIRELESS_PID] {
        if ctx.is_claimed(MCHOSE_VID, pid) { continue; }
        for c in ctx.find(MCHOSE_VID, pid, |c| {
            c.page() == 0xFF01 && c.usage() == 0x0010 && c.out_len() >= 65 && c.in_len() >= 65
        }) {
            if found {
                ctx.claim(MCHOSE_VID, pid);
                break;
            }
            let mut pct = -1;
            let mut chg = false;
            if !query_g3v2(ctx, &c, &mut pct, &mut chg) { continue; }

            let mut s = DeviceStatus {
                key: "mchose:g3v2".into(),
                kind: DeviceKind::Mouse,
                percent: pct,
                charging: chg,
                grace_sec: 1800,
                ..Default::default()
            };
            s.name = hid_product(&c);
            if s.name.is_empty() { s.name = "MCHOSE G3 V2".into(); }
            s.via = if pid == G3V2_WIRED_PID { "USB cable".into() }
                    else { "2.4 GHz receiver".into() };
            ctx.add(s, MCHOSE_VID, pid);
            found = true;
            break;
        }
    }
}
