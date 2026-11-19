//! Redragon wireless mice on Areson/CompX 2.4 GHz receivers (vendor 25A7), e.g. M913 Impact Elite
//! and M915RGB-WL. The battery is not pushed; it has to be asked for with a read-only "GetPower"
//! command, so nothing is ever written to the mouse (no LED, DPI or configuration report):
//!   request  SET_FEATURE on the FF02:0002 collection of interface 1, 17 bytes:
//!            [08][04][00 ...][checksum]  checksum = 0x55 - sum(bytes 0..15)
//!   reply    input report on the FF01:0000 collection of interface 1:
//!            [09][04][00][..][..][..][level][charging][00 ...][checksum]
//!            the whole frame sums to 0x55 (mod 256); level is 0..10 -> 0..100%
//!            (the official software showed 80% for level 8); charging is any non-zero byte.
//! Sources:
//!  * https://github.com/Qehbr/m913-ctl (M913 Linux driver: 17-byte frames, 0x55 checksum)
//!  * https://github.com/Doomguy-BFG9000/redragon-m913-battery-tray (M913 battery reader)
//!  * own capture of the official Redragon software against an M915RGB-WL on the 25A7:FA07
//!    receiver, which is what pinned down the two collections and the reply layout above.
//! Only the FA07/FA08 product ids are handled: the FA7B/FA7C family reports the level on a
//! different scale, and reporting it here would show a wrong percentage.

use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{clamp100, hex4, HidColl, HidIo, PollContext};
use crate::win::sleep_ms;

/// One GetPower exchange. percent is 0..100, or -1 when the mouse never answered.
struct Power {
    percent: i32,
    charging: bool,
}

impl Default for Power {
    fn default() -> Self { Power { percent: -1, charging: false } }
}

fn query_power(cmd: &mut dyn HidIo, reply: &mut dyn HidIo, out: &mut Power) -> bool {
    let mut req = vec![0u8; 17];
    req[0] = 0x08;  // report id
    req[1] = 0x04;  // GetPower
    let mut sum: u32 = 0;
    for i in 0..16 { sum += req[i] as u32; }
    req[16] = 0x55u32.wrapping_sub(sum) as u8;
    for attempt in 0..2 {
        if attempt != 0 { sleep_ms(200); }
        reply.flush();  // a report queued before the request would be mistaken for the answer
        if !cmd.set_feature(&req) { return false; }  // receiver gone; retrying will not help
        let mut r: Vec<u8> = Vec::new();
        if reply.read(&mut r, 1800) < 17 { continue; }  // asleep or out of range
        let mut total: u32 = 0;
        for &b in &r { total += b as u32; }
        if (total & 0xFF) != 0x55 || r[0] != 0x09 || r[1] != 0x04 || r[2] != 0x00 || r[6] > 10 { continue; }
        out.percent = clamp100(r[6] as i32 * 10);
        out.charging = r[7] != 0;
        return true;
    }
    false
}

/// Appends the mouse behind one receiver. Returns false (claiming nothing) when it does not answer,
/// so a sleeping mouse simply keeps its last reading instead of clearing it.
fn probe(ctx: &mut PollContext, cmd_coll: &HidColl, reply_coll: &HidColl, vid: u16, pid: u16) -> bool {
    let Some(mut cmd) = ctx.open_feature_only(cmd_coll) else { return false };  // zero access is enough for feature reports
    let Some(mut reply) = ctx.open(reply_coll) else { return false };
    let mut p = Power::default();
    if !query_power(&mut cmd, &mut reply, &mut p) { return false; }

    let mut s = DeviceStatus::default();
    s.key = format!("areson:{}:{}", hex4(vid), hex4(pid));
    s.name = "Redragon wireless mouse".into();
    s.kind = DeviceKind::Mouse;
    s.via = "2.4 GHz receiver".into();
    s.percent = p.percent;
    s.charging = p.charging;
    s.grace_sec = 1800;  // existing UI keeps the last reading, dimmed, while the mouse sleeps
    ctx.add(s, vid, pid);
    true
}

pub fn poll_areson(ctx: &mut PollContext) {
    for &(vid, pid) in &ctx.products(0x25A7) {
        if pid != 0xFA07 && pid != 0xFA08 { continue; }  // FA7B/FA7C report the level on another scale
        let cmd_colls = ctx.find(vid, pid, |c| {
            c.iface == 1 && c.page() == 0xFF02 && c.usage() == 0x0002 && c.feat_len() >= 17
        });
        let mut done = false;
        for c in &cmd_colls {
            let reply_colls = ctx.find(vid, pid, |c| {
                c.iface == 1 && c.page() == 0xFF01 && c.usage() == 0x0000 && c.in_len() >= 17
            });
            for i in &reply_colls {
                if probe(ctx, c, i, vid, pid) { done = true; }
                if done { break; }
            }
            if done { break; }
        }
    }
}
