//! Rongyuan 2.4 GHz receivers, used by Attack Shark, Ajazz and many other mice and keyboards (and
//! some MSI devices). One feature report returns both the keyboard and the mouse slot:
//!   request [00 F7 00 ...] on interface 2, vendor collection FFFF:0002
//!   reply   [00][ok][keyboard %][mouse %][keyboard offline][mouse offline]...
//! Receiver list and protocol from github.com/qu1ncky/BatteryTray (RongyuanDongleProvider, MIT),
//! itself taken from the official ATTACK SHARK web driver.
//!
//! This module also feeds `--dump` with the raw frames of the Xenta receivers (DumpXentaFrames in
//! misc_mice.cpp; the Xenta protocol notes live in misc_mice.rs).

use windows_sys::Win32::Foundation::GetLastError;

use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{HidFactory, HidIo, PollContext, WinHidFactory, enum_hid, hex4, hid_product};
use crate::win::{now_ms, sleep_ms};

const RECEIVERS: &[u32] = &[
    0x0DB0197E, 0x0DB08E9A, 0x145F0376, 0x145F038D, 0x14A5C045, 0x25AA2008, 0x25AA4008, 0x25AA4018, 0x31514011, 0x31514014, 0x31514017,
    0x31514021, 0x31514027, 0x3151402D, 0x31514038, 0x31515006, 0x31515007, 0x31515008, 0x31515020, 0x31515026, 0x3151502B, 0x31515031,
    0x31515037, 0x31515038, 0x3151503D, 0x3151503F, 0x31515040, 0x31515042, 0x31515045, 0x3151504B, 0x3151504E, 0x31515050, 0x31515052,
    0x31515055, 0x3151505A, 0x342DE3E0, 0x342DE3E1, 0x342DE3E2, 0x342DE3E6, 0x342DE3E7, 0x342DE3E8, 0x342DE3F5, 0x342DE3F6, 0x342DE3F7,
    0x342DE3FB, 0x342DE3FC, 0x342DE3FD, 0x347AA302, 0x347AA305, 0x374AA205, 0x374AA217, 0x374AA220, 0x374AA223, 0x374AA226, 0x374AA229,
    0x374AA234, 0x374AA237, 0x374AA251, 0x374AA263, 0x374AA268, 0x374AA311, 0x374AA314, 0x374AA319, 0x374AA322, 0x374AA329, 0x374AA355,
    0x379A1804, 0x379A1807, 0x38A90002, 0x38EE0000, 0x38EE0002, 0x38EE0039, 0x391D1A04, 0x391D1A08, 0x391D1A0E, 0x391D1A13, 0x391D1A25,
    0x391D1A2B, 0x391D1A34, 0x391D2017, 0x391D2A05,
];

fn is_receiver(vid: u16, pid: u16) -> bool {
    let key = ((vid as u32) << 16) | pid as u32;
    RECEIVERS.contains(&key)
}

fn query_status(d: &mut dyn HidIo, feat_len: u16, reply: &mut Vec<u8>) -> bool {
    for attempt in 0..3 {
        if attempt > 0 {
            sleep_ms(100);
        }
        let mut cmd = vec![0u8; feat_len as usize];
        cmd[1] = 0xF7;
        if !d.set_feature(&cmd) {
            return false;
        }
        sleep_ms(20);
        if d.get_feature(0, reply) && reply.len() >= 7 && (reply[2] | reply[3] | reply[4] | reply[5] | reply[6]) != 0 {
            return true;
        }
    }
    false
}

pub fn poll_rongyuan(ctx: &mut PollContext) {
    let mut products: Vec<(u16, u16)> = Vec::new();
    for c in &ctx.colls {
        if is_receiver(c.vid, c.pid) && !ctx.is_claimed(c.vid, c.pid) && !products.contains(&(c.vid, c.pid)) {
            products.push((c.vid, c.pid));
        }
    }

    for &(vid, pid) in &products {
        for c in ctx.find(vid, pid, |c| c.iface == 2 && c.page() == 0xFFFF && c.usage() == 0x0002 && c.feat_len() >= 7) {
            let Some(mut d) = ctx.open_feature_only(&c) else { continue };
            let mut r = Vec::new();
            if !query_status(d.as_mut(), c.feat_len(), &mut r) {
                continue;
            }
            let product = hid_product(&c);
            let generic = product.is_empty() || product.contains("Receiver") || product.contains("2.4G");
            // Slot layout: [2] keyboard %, [3] mouse %, [4] keyboard offline, [5] mouse offline.
            for slot in 0..2 {
                let keyboard = slot == 0;
                if r[if keyboard { 4 } else { 5 }] != 0 {
                    continue;
                } // nothing connected in this slot
                let level = r[if keyboard { 2 } else { 3 }];
                let mut s = DeviceStatus {
                    key: format!("rongyuan:{}:{}{}", hex4(vid), hex4(pid), if keyboard { ":kb" } else { ":ms" }),
                    kind: if keyboard { DeviceKind::Keyboard } else { DeviceKind::Mouse },
                    via: "2.4 GHz receiver".into(),
                    ..Default::default()
                };
                if vid == 0x3151 && pid == 0x402D && !keyboard {
                    s.name = "Attack Shark R3".into();
                } else if generic {
                    s.name = if keyboard { "Wireless keyboard" } else { "Wireless mouse" }.into();
                } else {
                    s.name = product.clone();
                }
                if level >= 1 && level <= 100 {
                    s.percent = level as i32;
                }
                ctx.out.push(s);
            }
            ctx.claim(vid, pid);
            break;
        }
    }
}

/// For `--dump`: the raw input reports each Xenta status collection sends during ~6 s (three frames
/// at the usual 2 s cadence), so a model whose frames are not understood yet can be added from a
/// user's output.
pub fn dump_xenta_frames() -> String {
    let mut out = String::new();
    let mut io = WinHidFactory;
    for c in enum_hid() {
        if c.vid != 0x1D57 || c.page() != 0x000A || c.in_len() < 5 {
            continue;
        }
        out += &format!("\nXenta {:04X}:{:04X} status frames (6 s):\n", c.vid, c.pid);
        let Some(mut d) = io.open_read_only(&c) else {
            out += &format!("  cannot open (error {})\n", unsafe { GetLastError() });
            continue;
        };
        let mut r = Vec::new();
        let mut frames = 0;
        let end = now_ms() + 6000;
        while (end as i64 - now_ms() as i64) > 0 && frames < 16 {
            let wait = 1.max(end as i64 - now_ms() as i64) as u32;
            if d.read(&mut r, wait) < 0 {
                break;
            }
            out.push(' ');
            for b in &r {
                out += &format!(" {b:02X}");
            }
            out.push('\n');
            frames += 1;
        }
        if frames == 0 {
            out += "  none (mouse off, asleep or on Bluetooth?)\n";
        }
    }
    out
}
