//! SONiX keyboards on their 2.4 GHz dongle: AJAZZ AK820 MAX ("AJAZZ AK820 MAX 2.4G", 05AC:024F, tested),
//! AULA F108 Pro (same 05AC:024F dongle) and AJAZZ AK980 V2 (0C45:FEFE). The dongle reuses Apple's
//! vendor id, so it is also matched by its vendor collection: interface 3, usage page FF60 / usage 61,
//! 33-byte input and output reports (report id 0 + 32 bytes).
//!   request [20 01 00 ... sum]          sum = byte sum of the 31 bytes before it
//!   reply   [20 01 00 level ... sum]    level in percent; same checksum
//! The keyboard only reports its level while it is switched to 2.4G mode. The protocol is read-only.
//! From github.com/donglover69/sonix-keyboard-studio (README, "2.4G dongles").

use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{HidColl, HidIo, PollContext, hex4, hid_product};
use crate::win::now_ms;

const DONGLES: [(u16, u16); 2] = [(0x05AC, 0x024F), (0x0C45, 0xFEFE)];

const LEN: usize = 32; // payload bytes after the report id; the last one is the checksum

/// Byte sum of the `n` bytes starting at `from`.
fn sum(b: &[u8], from: usize, n: usize) -> u8 {
    let mut s: u32 = 0;
    for i in from..from + n {
        s += b[i] as u32;
    }
    (s & 0xFF) as u8
}

/// Returns the level byte, or -1 when the dongle did not answer.
fn query_level(d: &mut dyn HidIo) -> i32 {
    let mut req = vec![0u8; 1 + LEN]; // [0] = report id 0
    req[1] = 0x20;
    req[2] = 0x01;
    req[LEN] = sum(&req, 1, LEN - 1);
    d.flush();
    if !d.write(&req, 500) {
        return -1;
    }
    let end = now_ms() + 500;
    loop {
        let left = (end as i64 - now_ms() as i64) as i32;
        if left <= 0 {
            return -1;
        }
        let mut r: Vec<u8> = Vec::new();
        let n = d.read(&mut r, left as u32); // report id 0 is stripped: r[0] is the first payload byte
        if n < 0 {
            return -1;
        }
        if n < LEN as i32 || r[0] != 0x20 || r[1] != 0x01 {
            continue;
        }
        if r[LEN - 1] != sum(&r, 0, LEN - 1) {
            continue;
        }
        return r[3] as i32;
    }
}

fn keyboard_name(c: &HidColl) -> String {
    let mut name = hid_product(c);
    if name.len() > 5 && name.ends_with(" 2.4G") {
        name.truncate(name.len() - 5);
    }
    if name.is_empty() { "Wireless keyboard".to_string() } else { name }
}

pub fn poll_sonix(ctx: &mut PollContext) {
    for &(vid, pid) in &DONGLES {
        if ctx.is_claimed(vid, pid) {
            continue;
        }
        for c in ctx.find(vid, pid, |c| {
            c.iface == 3 && c.page() == 0xFF60 && c.usage() == 0x0061 && c.out_len() == 1 + LEN as u16 && c.in_len() == 1 + LEN as u16
        }) {
            let Some(mut d) = ctx.open(&c) else { continue };
            // The first request can go unanswered while the 2.4 GHz link wakes up; retry once.
            let mut level = query_level(d.as_mut());
            if level < 0 {
                level = query_level(d.as_mut());
            }
            if level < 0 {
                continue;
            }
            let mut s = DeviceStatus {
                key: format!("sonix:{}:{}", hex4(vid), hex4(pid)),
                name: keyboard_name(&c),
                kind: DeviceKind::Keyboard,
                via: "2.4 GHz receiver".into(),
                grace_sec: 1800, // keep the last value if a sleeping keyboard stops answering
                ..Default::default()
            };
            s.connected = level >= 1 && level <= 100; // 0: keyboard off, out of range or in another mode
            if s.connected {
                s.percent = level;
            }
            ctx.add(s, vid, pid);
            break;
        }
    }
}
