//! Sprime PM1 wireless mouse (Nordic vendor id 1915), on its 2.4 GHz receiver or the USB cable.
//! Protocol from Sprime's web driver (sprime.pro): the same feature report 05, command 15 status
//! query as the Ninjutso Sora V2 (see ninjutso.rs).
//!   SET_FEATURE report 5, 31 payload bytes: [05][15][00][00][01][00 ...]
//!   GET_FEATURE report 5: [05][15] .. [9] percent, [10] charging, [11] fully charged, [12] online.
//!   Indices include the report ID, as in WebHID's returned DataView.
//! Product ids from the web driver's WebHID filters: mouse on the cable AC11 (black) / AC12 (white) /
//! AC13 (red); receivers AC1C and AD8C. The bootloader (AC0B) is never touched.
use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{hex4, PollContext};
use crate::win::sleep_ms;

fn is_cable(pid: u16) -> bool { pid == 0xAC11 || pid == 0xAC12 || pid == 0xAC13 }
fn is_receiver(pid: u16) -> bool { pid == 0xAC1C || pid == 0xAD8C }

pub fn poll_sprime(ctx: &mut PollContext) {
    for &(vid, pid) in &ctx.products(0x1915) {
        if !is_cable(pid) && !is_receiver(pid) { continue; }
        let cable = is_cable(pid);
        for c in ctx.find(vid, pid, |c| c.page() == 0xFFA0 && c.usage() == 1 && c.feat_len() >= 32) {
            let Some(mut d) = ctx.open_feature_only(&c) else { continue };
            let mut req = vec![0u8; 32];
            req[0] = 0x05;  // report id
            req[1] = 0x15;  // status query
            req[4] = 0x01;
            let mut s = DeviceStatus { ..Default::default() };
            let mut answered = false;
            for attempt in 0..4 {
                if attempt != 0 { sleep_ms(90); }
                if !d.set_feature(&req) { break; }
                sleep_ms(15);
                let mut r = Vec::new();
                if !d.get_feature(0x05, &mut r)
                    || r.len() < 13
                    || r[0] != 0x05
                    || r[1] != 0x15
                    || r[9] > 100
                {
                    continue;
                }
                answered = true;
                let full = r[11] != 0;
                s.connected = cable || r[12] != 0;  // receiver present, mouse off or out of range
                s.percent = if !s.connected { -1 } else if full { 100 } else { r[9] as i32 };
                s.charging = s.connected && r[10] != 0 && !full;
                if s.connected { break; }
            }
            if !answered { continue; }
            s.key = format!("sprime:{}:{}", hex4(vid), hex4(pid));
            s.name = "Sprime PM1".into();
            s.kind = DeviceKind::Mouse;
            s.via = if cable { "USB cable" } else { "2.4 GHz receiver" }.into();
            ctx.add(s, vid, pid);
            break;
        }
    }
}
