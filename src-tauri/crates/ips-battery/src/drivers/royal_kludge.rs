//! Royal Kludge (RK) MG6 Pro wireless mouse, vendor id 2E3C.
//! Protocol from RK's web driver (drive.rkgaming.com, assets/index-*.js): the MG6 Pro entries use
//! protocolType "QiWang", whose getDeviceBattery() builds an unencrypted 64-byte frame and sends it as
//! output report 0 on the vendor collection:
//!   [0] msg type 1 (TYPE_CFG_REMOTE_PARAM: forwarded to the mouse)
//!   [1] main cfg type 1 (CFG_MAIN_TYPE_SYS_CTRL), data length 0 in the high nibble
//!   [2] sub cfg type 2 (CFG_SYS_CTRL_GET_BATTER_VOL)
//!   [3] property byte, bit 0 = access READ
//! The reply has the same first three bytes; [3] bit 4 is access_res (1 = the mouse answered),
//! [4..5] voltage (mV, little endian), [6..7] percent, [8..9] temperature, [10] USB plugged in.
//! The web driver ignores replies with access_res 0; here they are shown as "asleep" (the receiver
//! answered for a mouse that did not).
//! Product ids from the same file: 00A6 / 00E6 = 2.4 GHz dongle (vendor page FF00:0001),
//! 00A5 / 00E5 = USB cable (vendor page FFF2:0001).

use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{hex4, HidIo, PollContext};
use crate::win::{now_ms, sleep_ms};

fn is_cable(pid: u16) -> bool { pid == 0x00A5 || pid == 0x00E5 }

fn poll_mg6(ctx: &mut PollContext, vid: u16, pid: u16) -> bool {
    let page: u16 = if is_cable(pid) { 0xFFF2 } else { 0xFF00 };
    for c in ctx.find(vid, pid, |c| {
        c.page() == page && c.usage() == 1 && c.out_len() == 65 && c.in_len() == 65
    }) {
        let Some(mut d) = ctx.open(&c) else { continue };
        let mut answered = false;
        let mut online = false;
        let mut percent = -1;
        let mut mv = 0;
        let mut plugged = false;
        for attempt in 0..3 {
            if online { break; }
            if attempt > 0 { sleep_ms(100); }
            d.flush();
            if !d.write(&[0x00, 0x01, 0x01, 0x02, 0x01], 500) { break; }
            // The receiver also pushes other notifications on this collection; skip until the battery reply.
            let end = now_ms() + 600;
            let mut r: Vec<u8> = Vec::new();
            while (end as i64 - now_ms() as i64) > 0 {
                let left = (end as i64 - now_ms() as i64) as i32;
                if d.read(&mut r, left as u32) < 11 { break; }
                if (r[0] & 0x1F) != 0x01 || (r[1] & 0x0F) != 0x01 || r[2] != 0x02 { continue; }
                answered = true;
                if ((r[3] >> 4) & 1) == 0 { break; }  // access_res 0: mouse did not answer
                let p = (r[6] as i32) | ((r[7] as i32) << 8);
                if p > 100 { break; }
                online = true;
                percent = p;
                mv = (r[4] as i32) | ((r[5] as i32) << 8);
                plugged = r[10] != 0;
                break;
            }
        }
        if !answered { continue; }
        let mut s = DeviceStatus {
            key: format!("rk:{}:{}", hex4(vid), hex4(pid)),
            name: "RK MG6 Pro".into(),
            kind: DeviceKind::Mouse,
            via: if is_cable(pid) { "USB cable" } else { "2.4 GHz receiver" }.into(),
            ..Default::default()
        };
        if online {
            s.percent = percent;
            if mv >= 3000 && mv <= 4500 { s.millivolts = mv; }
            s.charging = plugged || is_cable(pid);
        } else {
            s.asleep = true;  // receiver answered, mouse did not: asleep or off, keep the last value
        }
        ctx.add(s, vid, pid);
        return true;
    }
    false
}

pub fn poll_royal_kludge(ctx: &mut PollContext) {
    const VID: u16 = 0x2E3C;
    for &(v, pid) in &ctx.products(VID) {
        if pid == 0x00A5 || pid == 0x00A6 || pid == 0x00E5 || pid == 0x00E6 {
            poll_mg6(ctx, v, pid);
        }
    }
}
