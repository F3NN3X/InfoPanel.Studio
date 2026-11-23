//! Kysona, Pulsar and ATK / VXE wireless mice (VID 3554, ATK dongles 373B), G-Wolves models on
//! this protocol (VID 33E4, e.g. Fenrir Asym) and the original Hitscan Hyperlight (VID 3770,
//! verified on the 1K receiver 3770:0200), Pulsar's newer XS-1 generation (VID 3710, verified on
//! the 8K Dongle 3710:5406) and Redragon's Compx-based mice (M916 Pro 1K, M913 tri-mode, G49:
//! receiver 3554:F55D / F5D5, cable F55E; verified on an M916 Pro 1K through the F55D receiver).
//! They share one protocol:
//! 17-byte output/input report id 08: [08][cmd][0 x14][checksum], checksum = 0x55 - sum(bytes 0..15).
//!   cmd 03 = online status -> reply [6] = 1 when the mouse is connected to the dongle
//!   cmd 04 = battery       -> reply [6] = percent, [7] = charging, [8..9] = millivolts
//! ATK VXE Dragonfly R1 family (receivers 3554:F58A / F58E / F505, cables F58C / F58F / F506) uses
//! the same protocol on vendor collection FF02:0002; its receivers expose several other 17-byte
//! vendor collections (FF03..FF06), so FF02:0002 is tried first. IDs and protocol from
//! github.com/S1berla/vxe-r1-pro-max-battery, github.com/orcunturkol/BatteryTray (PR #1) and
//! HeyOkay/HaloBattery issue #273 (verified on F505).
//! Reference: Linux drivers/hid/hid-kysona.c (Lode Willems) and the hid-pulsar patch discussion;
//! Redragon ids from github.com/EliottV17/redragon-battery-omarchy and
//! github.com/pingpingjinping/g49-web-control.
//! The older dual-mode M913 on the Areson 25A7:FA07 / FA08 receiver is handled by areson.rs.

use crate::devices::{DeviceKind, DeviceStatus};
use crate::drivers::glorious::{g_wolves_is_cable, g_wolves_model_name};
use crate::hid::{HidIo, PollContext, hex4, hid_product, kind_from_collections};
use crate::win::now_ms;

/// Redragon uses Compx's own ids, and its receiver only calls itself "2.4G Wireless Receiver".
fn is_redragon(vid: u16, pid: u16) -> bool {
    vid == 0x3554 && (pid == 0xF55D || pid == 0xF5D5 || pid == 0xF55E)
}

fn is_vxe_r1(vid: u16, pid: u16) -> bool {
    vid == 0x3554 && (pid == 0xF58A || pid == 0xF58C || pid == 0xF58E || pid == 0xF58F || pid == 0xF505 || pid == 0xF506)
}

fn is_cable(vid: u16, pid: u16) -> bool {
    let hecate_cable = vid == 0x35BB && (pid == 0xD3FA || pid == 0xD3FC || pid == 0xD3FD);
    (vid == 0x33E4 && g_wolves_is_cable(pid))
        || hecate_cable
        || (vid == 0x3554 && (pid == 0xF55E || pid == 0xF58C || pid == 0xF58F || pid == 0xF506))
}

fn checksum(b: &[u8]) -> u8 {
    let mut sum: u32 = 0;
    for i in 0..16 {
        sum += b[i] as u32;
    }
    0x55u32.wrapping_sub(sum) as u8
}

/// Sends `cmd` and waits for its checksummed reply.
fn query(d: &mut dyn HidIo, cmd: u8, r: &mut Vec<u8>) -> bool {
    let mut req = vec![0u8; 17];
    req[0] = 0x08;
    req[1] = cmd;
    req[16] = checksum(&req);
    d.flush();
    if !d.write(&req, 500) {
        return false;
    }
    let end = now_ms() + 500;
    loop {
        let left = end as i64 - now_ms() as i64;
        if left <= 0 || d.read(r, left as u32) < 17 {
            return false;
        }
        if r[0] == 0x08 && r[1] == cmd && r[16] == checksum(r) {
            return true;
        }
    }
}

fn clean_name(mut n: String, vid: u16, pid: u16) -> String {
    if vid == 0x33E4 {
        return g_wolves_model_name(pid);
    }
    if is_redragon(vid, pid) {
        return "Redragon wireless mouse".into();
    } // shared by several models
    if is_vxe_r1(vid, pid) {
        return "VXE Dragonfly R1".into();
    } // the receivers call themselves "VXE NordicMouse 1K Dongle" etc.
    for suffix in [" Dongle", " Receiver", " 2.4G", " Wireless Receiver"] {
        if n.len() > suffix.len() && n.ends_with(suffix) {
            n.truncate(n.len() - suffix.len());
        }
    }
    if vid == 0x3770 {
        return "Hitscan Hyperlight".into();
    } // the receiver only calls itself "Hitscan USB Receiver"
    if vid == 0x35BB {
        return "HECATE mouse".into();
    }
    if n.is_empty() {
        n = if vid == 0x373B { "ATK wireless mouse".into() } else { "Wireless mouse".into() };
    }
    n
}

pub fn poll_kysona(ctx: &mut PollContext) {
    let mut seen_names: Vec<String> = Vec::new();
    for vendor in [0x3554u16, 0x373B, 0x3770, 0x33E4, 0x3710, 0x35BB] {
        for &(vid, pid) in &ctx.products(vendor) {
            // ATK N9 Pro / N9 Ultra headsets speak a serial protocol (atk_serial.cpp); never send
            // them mouse frames, even when the ATK app holds their port and they stay unclaimed.
            if vid == 0x373B && (pid == 0x11CA || pid == 0x11CB || pid == 0x1203 || pid == 0x1204) {
                continue;
            }
            // Kysona exposes a dedicated 17-byte collection; ATK / VXE receivers put report 08 in a
            // vendor collection that also carries larger reports. The checksummed reply filters out
            // anything that does not speak this protocol.
            let mut colls = ctx.find(vid, pid, |c| {
                (c.out_len() == 17 && c.in_len() == 17) || (c.page() >= 0xFF00 && c.out_len() >= 17 && c.in_len() >= 17)
            });
            // The battery channel is FF02:0002 where it exists; try it before the other vendor collections.
            colls.sort_by_key(|c| !(c.page() == 0xFF02 && c.usage() == 0x0002));
            for c in colls {
                let Some(mut d) = ctx.open(&c) else { continue };
                let mut r: Vec<u8> = Vec::new();
                let mut s = DeviceStatus::default();
                let mut answered = false;
                if query(&mut d, 0x03, &mut r) {
                    answered = true;
                    s.connected = r[6] != 0;
                }
                if (!answered || s.connected) && query(&mut d, 0x04, &mut r) {
                    answered = true;
                    s.connected = true;
                    if r[6] <= 100 {
                        s.percent = r[6] as i32;
                    }
                    s.charging = r[7] != 0;
                    s.millivolts = ((r[8] as i32) << 8) | r[9] as i32;
                } else if answered && s.connected {
                    s.asleep = true; // the receiver says online but the mouse did not answer: keep the last value
                }
                if !answered {
                    continue;
                }
                if !s.connected {
                    ctx.claim(vid, pid);
                    break;
                }
                s.key = format!("kysona:{}:{}", hex4(vid), hex4(pid));
                s.name = clean_name(hid_product(&c), vid, pid);
                s.kind = kind_from_collections(&ctx.colls, vid, pid);
                if s.kind == DeviceKind::Other {
                    s.kind = DeviceKind::Mouse;
                }
                s.via = if is_cable(vid, pid) { "USB cable" } else { "2.4 GHz receiver" }.into();
                s.grace_sec = 1800;
                // A mouse plugged in for charging can show up twice (cable + dongle); keep one.
                let dup = seen_names.iter().any(|n| *n == s.name);
                if dup {
                    ctx.claim(vid, pid);
                    for o in &mut ctx.out {
                        if o.name == s.name && s.charging {
                            o.charging = true;
                        }
                    }
                } else {
                    seen_names.push(s.name.clone());
                    ctx.add(s, vid, pid);
                }
                break;
            }
        }
    }
}
