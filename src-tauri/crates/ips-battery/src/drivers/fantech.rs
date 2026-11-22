//! Fantech Helios Go XD5 wireless gaming mouse (Areson / SinoWealth MCU, PixArt PAW3370 sensor).
//! VID 25A7, wired USB-C pid FA7B, 2.4 GHz dongle pid FA7C. The vendor configuration interface
//! uses 17-byte feature reports with report id 0x08:
//!   [08][cmd][0 x14][checksum], where the sum of all 17 bytes is 0x55 mod 256.
//!   cmd 04 = get battery -> reply [6] = percent, [7] = charging.
//! No handshake or configuration command is needed; the mouse answers a plain cmd 04.
//! The feature report and the reply are on different HID collections of interface 1, so the
//! command is written to one handle and all input collections are watched for the answer.
//! A sleeping or switched-off mouse does not answer; the last value is kept (grace_sec).
//! Reply layout confirmed on hardware (dongle 25A7:FA7C) and against the captures in
//! github.com/libratbag/libratbag issue #1893: [6] = percent, [7] = 1 when charging.
//! Protocol: github.com/jarjut/xd5-go-web (docs/PROTOCOL_SPECIFICATION.md and src/core/protocol.ts),
//! reverse engineered from Fantech's OemDrv.exe.

use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{HidIo, PollContext, hex4};
use crate::win::now_ms;

const K_VID: u16 = 0x25A7;
const K_PID_WIRED: u16 = 0xFA7B;
const K_PID_DONGLE: u16 = 0xFA7C;

const K_REPORT_ID: u8 = 0x08;
const K_PACKET_LEN: usize = 17;

fn make_packet(cmd: u8) -> Vec<u8> {
    let mut p = vec![0u8; K_PACKET_LEN];
    p[0] = K_REPORT_ID;
    p[1] = cmd;
    let mut sum: u32 = 0;
    for i in 0..K_PACKET_LEN - 1 {
        sum += p[i] as u32;
    }
    p[16] = 0x55u32.wrapping_sub(sum) as u8;
    p
}

#[derive(Clone, Copy)]
struct BatteryReply {
    pct: i32,
    charging: bool,
    checksum_ok: bool,
}

impl Default for BatteryReply {
    fn default() -> Self {
        BatteryReply { pct: -1, charging: false, checksum_ok: false }
    }
}

/// The reply comes back as an input report. Whether the HID stack keeps the report id in the
/// buffer varies, so accept the command byte at index 0 or 1. The two offsets under cmd 0 cover
/// the WebHID layouts documented by the project we took the protocol from.
fn parse_battery(r: &[u8]) -> Option<BatteryReply> {
    let mut sum: u32 = 0;
    for i in 0..r.len().min(K_PACKET_LEN) {
        sum += r[i] as u32;
    }
    let chk = r.len() >= K_PACKET_LEN && (sum & 0xFF) == 0x55;

    // r[power] = percent, r[charge] = charging flag; both must be plausible.
    let plausible = |power: usize, charge: usize| -> Option<BatteryReply> {
        if r.len() <= charge {
            return None;
        }
        let p = r[power] as i32;
        let c = r[charge];
        if p < 1 || p > 100 || c > 1 {
            return None;
        }
        Some(BatteryReply { pct: p, charging: c != 0, checksum_ok: chk })
    };

    if r.len() >= 7 && r[0] == 0x04 {
        if let Some(b) = plausible(5, 6) {
            return Some(b);
        }
        if let Some(b) = plausible(4, 5) {
            return Some(b);
        }
    }
    if r.len() >= 8 && r[1] == 0x04 {
        return plausible(6, 7);
    }
    None
}

fn remember(c: &BatteryReply, found: &mut BatteryReply) {
    if found.pct < 0 || (c.checksum_ok && !found.checksum_ok) {
        *found = *c;
    }
}

/// Sends the read-only cmd 0x04 on `cmd`, then watches `readers` for the reply. `cmd` itself is
/// one of the watched collections when it carries input reports (the C++ code pushed `&cmd` into
/// the readers vector first); each pass reads every collection once with a 40 ms timeout.
fn query_battery(cmd: &mut dyn HidIo, readers: &mut [Box<dyn HidIo>], cmd_reads: bool, pct: &mut i32, charging: &mut bool) -> bool {
    let req = make_packet(0x04);
    cmd.flush();
    if !cmd.set_feature(&req) {
        return false;
    }

    let mut found = BatteryReply::default();
    let mut r: Vec<u8> = Vec::new();
    let end = now_ms() + 500;
    while (end as i64 - now_ms() as i64) > 0 {
        if cmd_reads {
            let left = (end as i64 - now_ms() as i64) as i32;
            if left > 0 && cmd.read(&mut r, left.min(40) as u32) >= 6 {
                if let Some(c) = parse_battery(&r) {
                    remember(&c, &mut found);
                }
            }
        }
        for d in readers.iter_mut() {
            let left = (end as i64 - now_ms() as i64) as i32;
            if left <= 0 || d.read(&mut r, left.min(40) as u32) < 6 {
                continue;
            }
            if let Some(c) = parse_battery(&r) {
                remember(&c, &mut found);
            }
        }
        if found.checksum_ok {
            break;
        }
    }

    // Some firmware answers with the feature report instead of an input report.
    let mut f: Vec<u8> = Vec::new();
    if cmd.get_feature(K_REPORT_ID, &mut f) {
        if let Some(c) = parse_battery(&f) {
            remember(&c, &mut found);
        }
    }

    if found.pct < 0 {
        return false;
    }
    *pct = found.pct;
    *charging = found.charging;
    true
}

pub fn poll_fantech(ctx: &mut PollContext) {
    for &(vid, pid) in &ctx.products(K_VID) {
        if pid != K_PID_WIRED && pid != K_PID_DONGLE {
            continue;
        }

        let all = ctx.find(vid, pid, |_| true);
        let Some(feat_idx) = all.iter().position(|c| c.feat_len() >= K_PACKET_LEN as u16) else { continue };
        let feat = &all[feat_idx];

        let Some(mut cmd) = ctx.open(feat).or_else(|| ctx.open_feature_only(feat)) else { continue };

        // The vendor driver reads input report 08 on a different collection than the one it
        // writes feature report 08 to, so listen on every input collection of the device.
        let cmd_reads = feat.in_len() >= 6;
        let mut readers: Vec<Box<dyn HidIo>> = Vec::new();
        for (idx, c) in all.iter().enumerate() {
            if idx == feat_idx || c.in_len() < 6 {
                continue;
            }
            if let Some(d) = ctx.open(c) {
                readers.push(d);
            }
        }

        let mut pct = -1;
        let mut charging = false;
        if !query_battery(&mut cmd, &mut readers, cmd_reads, &mut pct, &mut charging) {
            continue;
        }

        let mut s = DeviceStatus::default();
        s.key = format!("fantech:{}", hex4(pid));
        s.name = "Fantech Helios Go XD5".into();
        s.kind = DeviceKind::Mouse;
        s.via = if pid == K_PID_WIRED { "USB cable" } else { "2.4 GHz receiver" }.into();
        s.percent = pct;
        s.charging = charging;
        s.grace_sec = 1800;
        ctx.add(s, vid, pid);
        break;
    }
}
