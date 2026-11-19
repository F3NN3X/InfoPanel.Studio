//! Glorious, Hitscan, G-Wolves and WLMouse wireless mice using the same
//! supplier protocol (G-Wolves calls it "XVI"; its other models use the Kysona protocol instead):
//! Request: 64-byte feature report (id 0), bytes [3]=02 [4]=02 [6]=83.
//! Reply:   [1]=status, [4]=02, [6]=83, [7]=charging (1), [8]=percent.
//! Status A1 = awake, A4 = asleep, A0 = waking up, others = unreachable.
//! Protocol: github.com/ikajdan/glorious-indicator, github.com/louis4craft/glorious-ctl,
//! Hitscan's web configurator (control.hitscan.com) and G-Wolves' (mouse.xyz, Config/env-models.json).
//! WLMouse's YING IDs: https://gm.wlmouse.gg/Config/env-models.json. The 1K dongle is shared
//! with other models; only the YING 8K receiver and its battery collection are matched here.

use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{clamp100, guess_kind, hex4, hid_product, kind_from_collections, HidColl, PollContext};
use crate::win::sleep_ms;

/// Model names and cable product ids from G-Wolves' own device list (mouse.xyz/Config/env-models.json).
/// 33E4:3854 is a dongle shared by many models, so it has no specific name.
pub fn g_wolves_model_name(pid: u16) -> String {
    match pid {
        0x3808 | 0x3817 => "G-Wolves HTM Plus",
        0x6808 | 0x6817 => "G-Wolves HSK Pro 2.0",
        0x5608 | 0x5617 | 0x5618 | 0x5619 => "G-Wolves HTXU",
        0x3608 | 0x3617 | 0x3619 => "G-Wolves Fenrir Pro",
        0x3908 | 0x3917 => "G-Wolves VUK",
        0x7904 | 0x7913 => "G-Wolves HT-S2",
        0x3708 | 0x3717 => "G-Wolves Fenrir Max",
        0x5308 | 0x5317 => "G-Wolves HTS Ultra",
        0x7704 | 0x7713 => "G-Wolves HTR",
        0x3508 | 0x3517 => "G-Wolves Fenrir",
        0x7908 | 0x7917 => "G-Wolves HT-S2 Pro",
        0x5808 | 0x5817 => "G-Wolves HSK Pro",
        0x2708 | 0x2717 | 0x2719 => "G-Wolves HTX Mini",
        0x5408 | 0x5417 | 0x5418 | 0x5419 => "G-Wolves HTS Plus",
        0x5708 | 0x5717 => "G-Wolves HTX",
        0x5908 | 0x5917 => "G-Wolves HSK Plus",
        0x7204 | 0x7203 => "G-Wolves HSK Lite",
        0x7708 | 0x7717 => "G-Wolves HTR Pro",
        0x5804 | 0x5803 => "G-Wolves HSK Pro ACE",
        0x5404 | 0x5403 => "G-Wolves HTS Plus ACE",
        0x5704 | 0x5703 => "G-Wolves HTX ACE",
        0x5904 | 0x5903 => "G-Wolves HSK Plus ACE",
        0x4718 | 0x4719 => "G-Wolves Lycan",
        0x4219 => "G-Wolves WARG",
        0x5219 => "G-Wolves HTS Plus Pro",
        0x3519 => "G-Wolves Fenrir Asym",
        0x2619 => "G-Wolves HTX Mini Asym",
        0x1619 => "G-Wolves Fenrir Max Asym",
        0x2119 => "G-Wolves VUK Mini",
        _ => "G-Wolves wireless mouse",
    }
    .into()
}

pub fn g_wolves_is_cable(pid: u16) -> bool {
    const WIRED: [u16; 36] = [
        0x1619, 0x2119, 0x2619, 0x2708, 0x2719, 0x3508, 0x3519, 0x3608, 0x3619, 0x3708, 0x3808, 0x3908,
        0x4219, 0x4718, 0x4719, 0x5219, 0x5308, 0x5404, 0x5408, 0x5418, 0x5419, 0x5608, 0x5618, 0x5619,
        0x5704, 0x5708, 0x5804, 0x5808, 0x5904, 0x5908, 0x6808, 0x7204, 0x7704, 0x7708, 0x7904, 0x7908,
    ];
    WIRED.contains(&pid)
}

// ---- the shared vendor table --------------------------------------------------------------------

struct Vendor {
    vid: u16,
    key_prefix: &'static str,
    reply_delay_ms: u32,
    /// Product name, or None when the pid is not one of ours (another brand on the same chip).
    name: fn(pid: u16) -> Option<String>,
    is_cable: fn(pid: u16) -> bool,
    /// Optional extra collection filter (C++ `matches`).
    matches: Option<fn(&HidColl) -> bool>,
}

fn glorious_name(pid: u16) -> Option<String> {
    match pid {
        0x2022 | 0x2011 => Some("Glorious Model O Wireless".into()),
        0x2023 | 0x2012 => Some("Glorious Model D Wireless".into()),
        0x2024 | 0x2013 => Some("Glorious Model O- Wireless".into()),
        0x2025 | 0x2014 => Some("Glorious Model D- Wireless".into()),
        0x2033 => Some("Glorious Model O 2 Wireless".into()),
        0x2034 | 0x2036 | 0x201A => Some("Glorious Model D 2 PRO".into()),
        _ => None,  // another brand on the same Sinowealth chip (e.g. Redragon keyboards)
    }
}

/// 258A is Sinowealth's vendor id, shared by many brands. For a product we do not know, use the
/// device's own name and work out whether it is a keyboard or a mouse instead of assuming a mouse.
fn sinowealth_kind(all: &[HidColl], vid: u16, pid: u16, name: &str) -> DeviceKind {
    let k = guess_kind(name);
    if k != DeviceKind::Other { return k; }
    let keyboards = all.iter()
        .filter(|c| c.vid == vid && c.pid == pid && c.page() == 0x01 && c.usage() == 0x06)
        .count();
    if keyboards >= 2 { return DeviceKind::Keyboard; }  // keyboards expose boot + NKRO keyboard collections
    kind_from_collections(all, vid, pid)
}

fn glorious_cable(pid: u16) -> bool {
    pid == 0x2011 || pid == 0x2012 || pid == 0x2013 || pid == 0x2014 || pid == 0x201A
}

fn hitscan_name(pid: u16) -> Option<String> {
    match pid {
        0x0136 => Some("Hitscan Hyperlight X".into()),
        0x0194 => Some("Hitscan Hyperlight N".into()),
        _ => Some("Hitscan Hyperlight".into()),
    }
}

fn hitscan_cable(pid: u16) -> bool { pid == 0x0136 || pid == 0x0194 }

fn g_wolves_name(pid: u16) -> Option<String> { Some(g_wolves_model_name(pid)) }

fn wlmouse_name(_pid: u16) -> Option<String> { Some("WLMouse YING".into()) }
fn wlmouse_cable(_pid: u16) -> bool { false }
fn wlmouse_matches(c: &HidColl) -> bool { c.pid == 0xA874 && c.page() == 0xFFFF && c.usage() == 0 }

const K_VENDORS: &[Vendor] = &[
    Vendor { vid: 0x258A, key_prefix: "glorious:", reply_delay_ms: 50, name: glorious_name, is_cable: glorious_cable, matches: None },
    Vendor { vid: 0x3770, key_prefix: "hitscan:", reply_delay_ms: 200, name: hitscan_name, is_cable: hitscan_cable, matches: None },
    Vendor { vid: 0x33E4, key_prefix: "gwolves:", reply_delay_ms: 100, name: g_wolves_name, is_cable: g_wolves_is_cable, matches: None },
    Vendor { vid: 0x36A7, key_prefix: "wlmouse:", reply_delay_ms: 100, name: wlmouse_name, is_cable: wlmouse_cable, matches: Some(wlmouse_matches) },
];

pub fn poll_glorious(ctx: &mut PollContext) {
    for v in K_VENDORS {
        for &(vid, pid) in &ctx.products(v.vid) {
            for c in ctx.find(vid, pid, |c| c.feat_len() == 65 && v.matches.map_or(true, |m| m(c))) {
                let Some(mut d) = ctx.open_feature_only(&c) else { continue };
                let mut r: Vec<u8> = Vec::new();
                let mut ok = false;
                for attempt in 0..2 {
                    let mut w = vec![0u8; 65];
                    w[3] = 0x02; w[4] = 0x02; w[6] = 0x83;
                    if !d.set_feature(&w) { break; }
                    sleep_ms(v.reply_delay_ms);
                    if !d.get_feature(0, &mut r) || r.len() < 9 { break; }
                    if r[6] != 0x83 || (r[1] & 0xF0) != 0xA0 { break; }  // not this protocol
                    if r[1] == 0xA0 && attempt == 0 { sleep_ms(400); continue; }  // waking up: ask again
                    ok = true;
                    break;
                }
                if !ok { continue; }
                let mut s = DeviceStatus::default();
                s.key = format!("{}{}", v.key_prefix, hex4(pid));
                if let Some(known) = (v.name)(pid) {
                    s.name = known;
                    s.kind = DeviceKind::Mouse;
                } else {
                    s.name = hid_product(&c);
                    if s.name.is_empty() { s.name = "Wireless device".into(); }
                    s.kind = sinowealth_kind(&ctx.colls, vid, pid, &s.name);
                }
                s.via = if (v.is_cable)(pid) { "USB cable" } else { "2.4 GHz receiver" }.into();
                s.charging = (v.is_cable)(pid) || r[7] == 0x01;
                if r[1] == 0xA1 && r[8] <= 100 {
                    s.percent = clamp100(if r[8] != 0 { r[8] as i32 } else { 1 });
                } else {
                    s.asleep = true;
                }
                ctx.add(s, vid, pid);
                break;
            }
        }
    }
}
