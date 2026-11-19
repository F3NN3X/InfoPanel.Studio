//! ATK / VXE NearLink mice on the "NK mouse NANO dongle" 373B:1216 (VXE R1 NK and siblings). This dongle
//! has no 17-byte report 08 collection for the Kysona protocol; it speaks ATK's BITMOUSE protocol on
//! vendor collection FF05:0001 instead, so this driver runs before the Kysona driver claims vendor 373B.
//!   Output report 08, 64 bytes: [08][checksum][72][02][00][01][cmd][01][00 ...],
//!   checksum = sum(bytes 2..63) & 0xFF; target 01 = the mouse behind the dongle.
//!   cmd 07 = battery level, cmd 0F = charging flag.
//!   Reply on the same collection: [08][72][status][seq][00][cmd][01][value]...; status FF = error.
//!   No reply = the mouse is asleep or switched off (moving it brings the reading back).
//! From github.com/HeyOkay/HaloBattery PR #350 (providers/atk_bitmouse.py; verified by a VXE R1 owner on
//! Windows: the level matches ATK's app, charging follows the cable) and github.com/qwr79/mouse-battery.

use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{hex4, HidIo, PollContext};
use crate::win::now_ms;

const K_VID: u16 = 0x373B;
const K_NANO_DONGLE: u16 = 0x1216;

/// Sends command `cmd` and returns its one-byte payload, or -1 when there is no valid reply.
fn query(d: &mut dyn HidIo, cmd: u8) -> i32 {
    let mut req = vec![0u8; 64];
    req[0] = 0x08;
    req[2] = 0x72;
    req[3] = 0x02;  // request length
    req[5] = 0x01;  // target: the mouse
    req[6] = cmd;
    req[7] = 0x01;  // expected reply length
    let mut sum: u32 = 0;
    for i in 2..req.len() { sum += req[i] as u32; }
    req[1] = (sum & 0xFF) as u8;
    d.flush();
    if !d.write(&req, 500) { return -1; }
    let end = now_ms() + 700;
    let mut r: Vec<u8> = Vec::new();
    loop {
        let left = end as i64 - now_ms() as i64;
        if left <= 0 { return -1; }
        if d.read(&mut r, left as u32) < 0 { return -1; }
        if r.len() < 8 || r[0] != 0x08 || r[1] != 0x72 { continue; }
        if r[5] != cmd { continue; }  // a reply to another request
        if r[2] == 0xFF { return -1; }
        return r[7] as i32;
    }
}

pub fn poll_atk_bitmouse(ctx: &mut PollContext) {
    if ctx.is_claimed(K_VID, K_NANO_DONGLE) { return; }
    for c in ctx.find(K_VID, K_NANO_DONGLE, |c| {
        c.page() == 0xFF05 && c.usage() == 0x0001 && c.out_len() >= 64 && c.in_len() >= 8
    }) {
        let Some(mut d) = ctx.open(&c) else { continue };
        let level = query(&mut d, 0x07);
        if level < 1 || level > 100 { continue; }  // asleep / off, or no valid reading
        let mut s = DeviceStatus::default();
        s.key = format!("atknk:{}", hex4(K_NANO_DONGLE));
        s.name = "ATK / VXE NK mouse".into();  // the dongle is shared by several NearLink models
        s.kind = DeviceKind::Mouse;
        s.via = "2.4 GHz receiver".into();
        s.grace_sec = 1800;  // the dongle stops answering while the mouse sleeps: keep the last value
        s.percent = level;
        s.charging = query(&mut d, 0x0F) == 1;
        ctx.add(s, K_VID, K_NANO_DONGLE);
        break;
    }
}
