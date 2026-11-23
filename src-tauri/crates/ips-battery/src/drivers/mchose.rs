//! MCHOSE wireless mice on the 2.4 GHz receiver or USB cable (VID 5253): L7 / L7 Pro / L7 Ultra,
//! M7 / M7 Ultra, A7 / A7 Ultra, K7 (the receiver PID is 1020 for several of them, so the model is
//! not told apart by PID; the product string is used for the name). The same protocol also runs on
//! the Realtek ODM dongles with VID 3837 (A5 V2 Ultra receiver 3837:100C verified on real hardware;
//! the A7 V2 Ultra+ receiver 3837:100B is requested in issue 227, and 1001 / 100A / 1012 appear as
//! MCHOSE products in the protocol projects). Other 3837 products (the G3 V2, keyboards) use other
//! protocols and are deliberately not probed here.
//!   request: 65-byte feature report on the vendor collection FF01:0001, report id 0x12, payload
//!            [06 00 00 ...] with EVERY payload byte inverted (^ 0xFF), padding included
//!   reply:   the same report read back: [12][F9 = 06 ^ FF][payload, inverted]
//!            payload = vid:u16 (5253; 41E4 or 3837 on the 3837 dongles), model:u16, firmware:u32,
//!            flags:u8 (09 on the receiver, 00 on the cable), level:u8, charging:u8
//! The receiver only has a value while the mouse itself is awake: asleep, it still echoes the
//! command but with an all-zero payload, so that is reported as "asleep" (the last value is kept).
//! The request must be sent again for every read attempt; reading again without asking returns
//! the request itself.
//! Protocol: github.com/alexfrih/mchose-linux (PROTOCOL.md, recovered from MCHOSE's M HUB driver),
//! confirmed on a real MCHOSE L7 Ultra (5253:1020, receiver) and MCHOSE A5 V2 Ultra (3837:100C,
//! receiver, level verified against the vendor software).

use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{PollContext, clamp100, hex4, hid_product};
use crate::win::sleep_ms;

const VID: u16 = 0x5253;
const VID_REALTEK: u16 = 0x3837;
/// 3837 dongle PIDs seen in the wild; kept explicit so keyboards and the G3 V2 on the same vendor
/// id are never probed with this protocol.
const REALTEK_PIDS: [u16; 5] = [0x100C, 0x100B, 0x100A, 0x1001, 0x1012];
const REPORT: u8 = 0x12;
const CMD_STATUS: u8 = 0x06;

/// Returns 1 for a status reply, 0 for a valid echo with an empty payload (mouse asleep), -1 otherwise.
fn parse_status(r: &[u8], vid_field: u16, alt_vid_field: u16, level: &mut i32, charging: &mut i32, flags: &mut i32) -> i32 {
    if r.len() < 13 || r[0] != REPORT || r[1] != (CMD_STATUS ^ 0xFF) {
        return -1;
    }
    let mut p = [0u8; 11];
    for i in 0..11 {
        p[i] = r[2 + i] ^ 0xFF;
    }
    if p.iter().all(|&b| b == 0) {
        return 0;
    }
    let field = (p[0] as u16) | ((p[1] as u16) << 8);
    if field != vid_field && field != alt_vid_field {
        return -1;
    }
    *level = p[9] as i32;
    *charging = p[10] as i32;
    *flags = p[8] as i32;
    if *level <= 100 { 1 } else { -1 }
}

fn poll_product(ctx: &mut PollContext, vid: u16, pid: u16, vid_field: u16, alt_vid_field: u16) {
    for c in ctx.find(vid, pid, |c| c.page() == 0xFF01 && c.usage() == 0x0001 && c.feat_len() >= 65) {
        let Some(mut d) = ctx.open_feature_only(&c) else { continue };
        let mut req = vec![0xFFu8; c.feat_len() as usize]; // inverted zero padding
        req[0] = REPORT;
        req[1] = CMD_STATUS ^ 0xFF;
        let mut state = -1;
        let mut level = 0;
        let mut charging = 0;
        let mut flags = 0;
        let mut attempt = 0;
        while attempt < 5 && state != 1 {
            if attempt > 0 {
                sleep_ms(100);
            }
            attempt += 1;
            let mut r = Vec::new();
            if !d.set_feature(&req) {
                break;
            }
            sleep_ms(120);
            if !d.get_feature(REPORT, &mut r) {
                continue;
            }
            let st = parse_status(&r, vid_field, alt_vid_field, &mut level, &mut charging, &mut flags);
            if st > state {
                state = st;
            }
        }
        if state < 0 {
            continue;
        } // not answering this protocol
        let mut s = DeviceStatus { key: format!("mchose:{}", hex4(pid)), kind: DeviceKind::Mouse, ..Default::default() };
        s.name = hid_product(&c);
        if s.name.is_empty() {
            s.name = "MCHOSE mouse".into();
        }
        if state == 1 {
            s.percent = clamp100(level);
            s.charging = charging != 0;
            s.via = if flags == 0 && charging != 0 { "USB cable".into() } else { "2.4 GHz receiver".into() };
        } else {
            s.asleep = true;
            s.via = "2.4 GHz receiver".into();
        }
        ctx.add(s, vid, pid);
        break;
    }
}

pub fn poll_mchose(ctx: &mut PollContext) {
    for &(vid, pid) in &ctx.products(VID) {
        poll_product(ctx, vid, pid, VID, VID);
    }
    for &pid in &REALTEK_PIDS {
        if ctx.is_claimed(VID_REALTEK, pid) {
            continue;
        }
        // The vid field differs between 3837 dongles: 41E4 on the A5 V2 Ultra (100C), 3837 on the
        // K7 Ultra (1001).
        poll_product(ctx, VID_REALTEK, pid, 0x41E4, VID_REALTEK);
    }
}
