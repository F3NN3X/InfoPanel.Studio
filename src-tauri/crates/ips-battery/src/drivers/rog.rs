//! ASUS ROG wireless keyboards, mice and the ROG Pelta headset (VID 0B05), including the ROG Omni
//! Receiver (0B05:1ACE).
//! Query: [report id][12][sub]   sub 01 = keyboard battery, sub 07 = mouse battery.
//! Reply: [report id][12][sub]...  keyboard: [6] % (Falchion: [11]), [9] == 1 charging
//!                                 mouse:    [5] level (x25 on older 0-4 gauges), [10] charging
//! [1..2] == FF AA means the device behind the receiver did not answer (asleep / off).
//! Offsets count the report id byte. Only query commands are sent.
//! Protocol and model table from github.com/SteveWang92/peripheral-battery-tray (rog-battery,
//! MIT, itself based on G-Helper) and github.com/1gcat/BatteryTool.

use std::collections::BTreeSet;

use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{hex4, HidIo, PollContext};
use crate::win::now_ms;

#[derive(Clone, Copy, PartialEq, Eq)]
enum Kind { Keyboard, Mouse }

const KB: Kind = Kind::Keyboard;
const MS: Kind = Kind::Mouse;

struct Model {
    pid: u16,
    name: &'static str,
    kind: Kind,
    report_id: u8,               // 0 = unnumbered
    iface: i32,                  // USB interface (-1 = any vendor-page collection)
    col: Option<&'static str>,   // required collection tag in the path ("col02"), or None
    offset: usize,               // battery byte
    scale: i32,                  // battery multiplier
}

const MODELS: &[Model] = &[
    // Keyboards (Omni = col02 report 02, receiver/wired = interface 1 unnumbered)
    Model { pid: 0x1A85, name: "ROG Azoth",                    kind: KB, report_id: 2, iface: 2, col: Some("col02"), offset: 6,  scale: 1 },
    Model { pid: 0x1A85, name: "ROG Azoth",                    kind: KB, report_id: 0, iface: 1, col: None,       offset: 6,  scale: 1 },
    Model { pid: 0x1A83, name: "ROG Azoth",                    kind: KB, report_id: 0, iface: 1, col: None,       offset: 6,  scale: 1 },
    Model { pid: 0x1B42, name: "ROG Azoth Extreme",            kind: KB, report_id: 2, iface: 2, col: Some("col02"), offset: 6,  scale: 1 },
    Model { pid: 0x1B3F, name: "ROG Azoth Extreme",           kind: KB, report_id: 0, iface: 1, col: None,       offset: 6,  scale: 1 },
    Model { pid: 0x1CF1, name: "ROG Azoth Extreme SE",        kind: KB, report_id: 2, iface: 2, col: Some("col02"), offset: 6,  scale: 1 },
    Model { pid: 0x1CEF, name: "ROG Azoth Extreme SE",        kind: KB, report_id: 0, iface: 1, col: None,       offset: 6,  scale: 1 },
    Model { pid: 0x1C25, name: "ROG Azoth X",                  kind: KB, report_id: 0, iface: 1, col: None,       offset: 6,  scale: 1 },
    Model { pid: 0x1C24, name: "ROG Azoth X",                  kind: KB, report_id: 0, iface: 1, col: None,       offset: 6,  scale: 1 },
    Model { pid: 0x193E, name: "ROG Falchion",                 kind: KB, report_id: 0, iface: 1, col: None,       offset: 11, scale: 1 },
    Model { pid: 0x193C, name: "ROG Falchion",                kind: KB, report_id: 0, iface: 1, col: None,       offset: 11, scale: 1 },
    Model { pid: 0x1B04, name: "ROG Falchion RX",             kind: KB, report_id: 0, iface: -1, col: None,      offset: 11, scale: 1 },
    Model { pid: 0x1B06, name: "ROG Falchion RX Low Profile", kind: KB, report_id: 2, iface: 2, col: Some("col02"), offset: 11, scale: 1 },
    Model { pid: 0x1AB0, name: "ROG Strix Scope II 96",       kind: KB, report_id: 2, iface: 2, col: Some("col02"), offset: 6,  scale: 1 },
    Model { pid: 0x1AAE, name: "ROG Strix Scope II 96",      kind: KB, report_id: 0, iface: 1, col: None,       offset: 6,  scale: 1 },
    Model { pid: 0x1B7A, name: "ROG Strix Scope II 96 RX",   kind: KB, report_id: 2, iface: 2, col: Some("col02"), offset: 6,  scale: 1 },
    Model { pid: 0x1B78, name: "ROG Strix Scope II 96 RX",   kind: KB, report_id: 0, iface: 1, col: None,       offset: 6,  scale: 1 },
    Model { pid: 0x1A07, name: "ROG Strix Scope RX TKL",     kind: KB, report_id: 0, iface: -1, col: None,      offset: 6,  scale: 1 },
    // Mice (Omni = col03 report 03, receiver/wired = interface 0 unnumbered)
    Model { pid: 0x18E5, name: "ROG Chakram",                       kind: MS, report_id: 0, iface: 0, col: None,       offset: 5, scale: 25 },
    Model { pid: 0x18E3, name: "ROG Chakram",                       kind: MS, report_id: 0, iface: 0, col: None,       offset: 5, scale: 25 },
    Model { pid: 0x1A1A, name: "ROG Chakram X",                    kind: MS, report_id: 0, iface: 0, col: None,       offset: 5, scale: 1 },
    Model { pid: 0x1A18, name: "ROG Chakram X",                    kind: MS, report_id: 0, iface: 0, col: None,       offset: 5, scale: 1 },
    Model { pid: 0x18A0, name: "ROG Gladius II Wireless",          kind: MS, report_id: 0, iface: 2, col: None,       offset: 5, scale: 25 },
    Model { pid: 0x197F, name: "ROG Gladius III Wireless",          kind: MS, report_id: 0, iface: 0, col: None,       offset: 5, scale: 1 },
    Model { pid: 0x197D, name: "ROG Gladius III Wireless",          kind: MS, report_id: 0, iface: 0, col: None,       offset: 5, scale: 1 },
    Model { pid: 0x1A72, name: "ROG Gladius III Aimpoint",         kind: MS, report_id: 3, iface: 2, col: Some("col03"), offset: 5, scale: 1 },
    Model { pid: 0x1A72, name: "ROG Gladius III Aimpoint",         kind: MS, report_id: 0, iface: 0, col: None,       offset: 5, scale: 1 },
    Model { pid: 0x1A70, name: "ROG Gladius III Aimpoint",         kind: MS, report_id: 0, iface: 0, col: None,       offset: 5, scale: 1 },
    Model { pid: 0x1B0C, name: "ROG Gladius III Aimpoint EVA-02",  kind: MS, report_id: 0, iface: 0, col: None,       offset: 5, scale: 1 },
    Model { pid: 0x1B0A, name: "ROG Gladius III Aimpoint EVA-02",  kind: MS, report_id: 0, iface: 0, col: None,       offset: 5, scale: 1 },
    Model { pid: 0x1A94, name: "ROG Harpe Ace Aim Lab Edition",    kind: MS, report_id: 3, iface: 2, col: Some("col03"), offset: 5, scale: 1 },
    Model { pid: 0x1A94, name: "ROG Harpe Ace Aim Lab Edition",    kind: MS, report_id: 0, iface: 0, col: None,       offset: 5, scale: 1 },
    Model { pid: 0x1A92, name: "ROG Harpe Ace Aim Lab Edition",    kind: MS, report_id: 0, iface: 0, col: None,       offset: 5, scale: 1 },
    Model { pid: 0x1B68, name: "ROG Harpe Ace Extreme",            kind: MS, report_id: 3, iface: 2, col: Some("col03"), offset: 5, scale: 1 },
    Model { pid: 0x1B69, name: "ROG Harpe Ace Extreme",            kind: MS, report_id: 3, iface: 2, col: Some("col03"), offset: 5, scale: 1 },
    Model { pid: 0x1B67, name: "ROG Harpe Ace Extreme",            kind: MS, report_id: 0, iface: 0, col: None,       offset: 5, scale: 1 },
    Model { pid: 0x1B65, name: "ROG Harpe Ace Mini",               kind: MS, report_id: 3, iface: 2, col: Some("col03"), offset: 5, scale: 1 },
    Model { pid: 0x1B63, name: "ROG Harpe Ace Mini",               kind: MS, report_id: 0, iface: 0, col: None,       offset: 5, scale: 1 },
    Model { pid: 0x1AD0, name: "ROG Harpe II Ace",                 kind: MS, report_id: 3, iface: 2, col: Some("col03"), offset: 5, scale: 1 },
    Model { pid: 0x1C69, name: "ROG Harpe II Ace",                 kind: MS, report_id: 0, iface: 0, col: None,       offset: 5, scale: 1 },
    Model { pid: 0x1960, name: "ROG Keris Wireless",               kind: MS, report_id: 0, iface: 0, col: None,       offset: 5, scale: 25 },
    Model { pid: 0x195E, name: "ROG Keris Wireless",               kind: MS, report_id: 0, iface: 0, col: None,       offset: 5, scale: 25 },
    Model { pid: 0x1A59, name: "ROG Keris Wireless EVA Edition",   kind: MS, report_id: 0, iface: 0, col: None,       offset: 5, scale: 25 },
    Model { pid: 0x1A57, name: "ROG Keris Wireless EVA Edition",   kind: MS, report_id: 0, iface: 0, col: None,       offset: 5, scale: 25 },
    Model { pid: 0x1A68, name: "ROG Keris Wireless Aimpoint",      kind: MS, report_id: 3, iface: 2, col: Some("col03"), offset: 5, scale: 1 },
    Model { pid: 0x1A6A, name: "ROG Keris Wireless Aimpoint",      kind: MS, report_id: 3, iface: 2, col: Some("col03"), offset: 5, scale: 1 },
    Model { pid: 0x1A68, name: "ROG Keris Wireless Aimpoint",      kind: MS, report_id: 0, iface: 0, col: None,       offset: 5, scale: 1 },
    Model { pid: 0x1A66, name: "ROG Keris Wireless Aimpoint",      kind: MS, report_id: 0, iface: 0, col: None,       offset: 5, scale: 1 },
    Model { pid: 0x1B1A, name: "ROG Keris II Ace",                 kind: MS, report_id: 3, iface: 2, col: Some("col03"), offset: 5, scale: 1 },
    Model { pid: 0x1B18, name: "ROG Keris II Ace",                 kind: MS, report_id: 3, iface: 2, col: Some("col03"), offset: 5, scale: 1 },
    Model { pid: 0x1B16, name: "ROG Keris II Ace",                 kind: MS, report_id: 0, iface: 0, col: None,       offset: 5, scale: 1 },
    Model { pid: 0x1C0E, name: "ROG Keris II Origin",              kind: MS, report_id: 3, iface: 2, col: Some("col03"), offset: 5, scale: 1 },
    Model { pid: 0x1C0C, name: "ROG Keris II Origin",             kind: MS, report_id: 0, iface: 0, col: None,       offset: 5, scale: 1 },
    Model { pid: 0x1D4E, name: "ROG Keris II Origin KJP",         kind: MS, report_id: 3, iface: 2, col: Some("col03"), offset: 5, scale: 1 },
    Model { pid: 0x1D4C, name: "ROG Keris II Origin KJP",         kind: MS, report_id: 0, iface: 0, col: None,       offset: 5, scale: 1 },
    Model { pid: 0x1908, name: "ROG Pugio II",                     kind: MS, report_id: 0, iface: 0, col: None,       offset: 5, scale: 25 },
    Model { pid: 0x1906, name: "ROG Pugio II",                     kind: MS, report_id: 0, iface: 0, col: None,       offset: 5, scale: 25 },
    Model { pid: 0x1979, name: "ROG Spatha X",                    kind: MS, report_id: 0, iface: 0, col: None,       offset: 5, scale: 1 },
    Model { pid: 0x1977, name: "ROG Spatha X",                    kind: MS, report_id: 0, iface: 0, col: None,       offset: 5, scale: 1 },
    Model { pid: 0x18B4, name: "ROG Strix Carry",                 kind: MS, report_id: 0, iface: 1, col: None,       offset: 7, scale: 25 },
    Model { pid: 0x1949, name: "ROG Strix Impact II Wireless",    kind: MS, report_id: 0, iface: 0, col: None,       offset: 5, scale: 25 },
    Model { pid: 0x1947, name: "ROG Strix Impact II Wireless",   kind: MS, report_id: 0, iface: 0, col: None,       offset: 5, scale: 25 },
    Model { pid: 0x1AD7, name: "ROG Strix Impact III Wireless",   kind: MS, report_id: 3, iface: 2, col: Some("col03"), offset: 5, scale: 1 },
];

fn path_has(path: &str, tag: &str) -> bool {
    path.to_lowercase().contains(tag)
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Reply { Ok, Asleep, None }

fn query(d: &mut dyn HidIo, rid: u8, cmd: u8, sub: u8, reply: &mut Vec<u8>) -> Reply {
    d.flush();
    if !d.write(&[rid, cmd, sub], 500) { return Reply::None; }
    let end = now_ms() + 500;
    let mut r: Vec<u8> = Vec::new();
    while (end as i64 - now_ms() as i64) > 0 {
        let left = (end as i64 - now_ms() as i64) as u32;
        if d.read(&mut r, left) < 11 { return Reply::None; }
        if rid == 0 { r.insert(0, 0x00); }  // restore the report id slot so offsets match
        if r.len() < 12 { continue; }
        if r[1] == 0xFF && r[2] == 0xAA { return Reply::Asleep; }
        if r[1] == cmd && r[2] == sub { *reply = r.clone(); return Reply::Ok; }
    }
    Reply::None
}

/// Reads one model's battery through an open collection. Returns false if it did not answer.
fn read_model(d: &mut dyn HidIo, m: &Model, s: &mut DeviceStatus) -> bool {
    let mut r: Vec<u8> = Vec::new();
    let res = query(d, m.report_id, 0x12, if m.kind == KB { 0x01 } else { 0x07 }, &mut r);
    if res == Reply::None { return false; }
    s.key = format!("rog:{}{}", hex4(m.pid), if m.kind == KB { ":kb" } else { ":ms" });
    s.name = m.name.into();
    s.kind = if m.kind == KB { DeviceKind::Keyboard } else { DeviceKind::Mouse };
    s.via = if m.report_id != 0 { "ROG Omni Receiver" } else { "2.4 GHz receiver / USB" }.into();
    if res == Reply::Asleep {
        s.asleep = true;
    } else if m.kind == KB {
        if (r[m.offset] as i32) <= 100 { s.percent = r[m.offset] as i32; }
        s.charging = r[9] == 1;
    } else {
        let v = r[m.offset] as i32 * m.scale;
        if v > 0 && v <= 100 { s.percent = v; } else { s.asleep = true; }  // 0 means unavailable, not empty
        s.charging = r[10] != 0;
    }
    true
}

fn add_once(ctx: &mut PollContext, seen: &mut Vec<String>, s: &DeviceStatus) {
    for n in seen.iter() {
        if *n == s.name { return; }
    }
    seen.push(s.name.clone());
    ctx.out.push(s.clone());
}

/// ROG Omni Receiver (0B05:1ACE): ask it which devices are paired ([01 A0 00] on col01 lists their
/// product ids in 4-byte slots from byte 5), then read each one on its own channel of the receiver.
fn poll_omni(ctx: &mut PollContext, seen: &mut Vec<String>) {
    if ctx.is_claimed(0x0B05, 0x1ACE) { return; }
    let list = ctx.find(0x0B05, 0x1ACE, |c| c.iface == 2 && c.out_len() >= 12 && path_has(&c.path, "col01"));
    if list.is_empty() { return; }
    let mut r: Vec<u8> = Vec::new();
    let Some(mut d) = ctx.open(&list[0]) else { return };
    if query(d.as_mut(), 0x01, 0xA0, 0x00, &mut r) != Reply::Ok { return; }
    ctx.claim(0x0B05, 0x1ACE);
    let mut at = 5usize;
    while at + 1 < r.len() {
        let pid = (r[at] as u16) | ((r[at + 1] as u16) << 8);
        if pid == 0 { break; }
        for m in MODELS.iter() {
            if m.pid != pid || m.report_id == 0 { continue; }  // only the Omni-channel entry of that model
            if let Some(col) = m.col {
                for c in ctx.find(0x0B05, 0x1ACE, |c| c.iface == 2 && c.out_len() >= 12 && path_has(&c.path, col)) {
                    if let Some(mut dev) = ctx.open(&c) {
                        let mut s = DeviceStatus::default();
                        if read_model(dev.as_mut(), m, &mut s) { add_once(ctx, seen, &s); break; }
                    }
                }
            }
            break;
        }
        at += 4;
    }
}

/// ROG Pelta headset, 2.4 GHz dongle 0B05:1B84. Vendor collection FF00:0001 on interface 3, report
/// id CC, 64 bytes each way. That collection has no interrupt OUT pipe, so the query goes out as
/// HidD_SetOutputReport with a read already pending.
///   CC 12 07 -> CC 12 07 00 00 [5] sleep min [6] battery % (FE = unknown) [7] low-battery alert %
///   CC 12 08 -> CC 12 08 00 00 [5] 1 = charging
/// A sleeping or switched-off headset answers with FF AA in [5..6]. Unsolicited event reports
/// (CC 12 0E / 09 ...) are skipped by matching the echoed command byte.
/// Protocol from github.com/jimm0thy/pelta-control (MIT), github.com/B1Chat/BatteryWatch (MIT) and
/// github.com/TheWebDog/quiet-battery/issues/1.
const PELTA_PID: u16 = 0x1B84;

fn pelta_query(d: &mut dyn HidIo, cmd: u8, reply: &mut Vec<u8>) -> Reply {
    d.flush();
    // The first answer after the headset reconnects can take ~750 ms.
    let end = now_ms() + 1200;
    let mut r: Vec<u8> = Vec::new();
    let mut n = d.set_output_and_read(&[0xCC, 0x12, cmd], &mut r, 1200);
    while n >= 8 {
        if r[0] == 0xCC && r[1] == 0xFF && r[2] == 0xAA { return Reply::Asleep; }
        if r[0] == 0xCC && r[1] == 0x12 {
            if r[5] == 0xFF && r[6] == 0xAA { return Reply::Asleep; }
            if r[2] == cmd { *reply = r.clone(); return Reply::Ok; }
        }
        let left = (end as i64 - now_ms() as i64) as i32;
        if left <= 0 { break; }
        n = d.read(&mut r, left as u32);
    }
    Reply::None
}

fn poll_pelta(ctx: &mut PollContext) {
    if ctx.is_claimed(0x0B05, PELTA_PID) { return; }
    let colls = ctx.find(0x0B05, PELTA_PID, |c| {
        c.iface == 3 && c.page() == 0xFF00 && c.usage() == 0x0001 && c.in_len() >= 8 && c.out_len() >= 8
    });
    for c in colls {
        let Some(mut d) = ctx.open(&c) else { continue };
        let mut r: Vec<u8> = Vec::new();
        let res = pelta_query(d.as_mut(), 0x07, &mut r);
        if res == Reply::None { continue; }
        let mut s = DeviceStatus {
            key: format!("rog:{}:hs", hex4(PELTA_PID)),
            name: "ROG Pelta".into(),
            kind: DeviceKind::Headset,
            via: "2.4 GHz receiver".into(),
            ..Default::default()
        };
        if res == Reply::Asleep {
            s.asleep = true;
        } else {
            if (r[6] as i32) <= 100 { s.percent = r[6] as i32; } else { s.asleep = true; }  // FE = level not known yet
            let mut ch: Vec<u8> = Vec::new();
            if pelta_query(d.as_mut(), 0x08, &mut ch) == Reply::Ok { s.charging = ch[5] == 1; }
        }
        ctx.out.push(s);
        ctx.claim(0x0B05, PELTA_PID);
        return;
    }
}

pub fn poll_rog(ctx: &mut PollContext) {
    // A receiver channel (e.g. the SpeedNova 8K receiver 1AD0) answers "asleep" when nothing is
    // paired to it too, so a model is only shown there once it has really answered (issue #140).
    static AWAKE: std::sync::Mutex<BTreeSet<u16>> = std::sync::Mutex::new(BTreeSet::new());

    let mut seen: Vec<String> = Vec::new();  // one entry per device name (wired + receiver both present while charging)
    poll_pelta(ctx);
    poll_omni(ctx, &mut seen);
    for m in MODELS.iter() {
        if ctx.is_claimed(0x0B05, m.pid) { continue; }
        let colls = ctx.find(0x0B05, m.pid, |c| {
            if c.out_len() < 12 || c.page() < 0xFF00 { return false; }
            if m.iface >= 0 && c.iface != m.iface { return false; }
            m.col.map_or(true, |col| path_has(&c.path, col))
        });
        for c in colls {
            let Some(mut d) = ctx.open(&c) else { continue };
            let mut s = DeviceStatus::default();
            if !read_model(d.as_mut(), m, &mut s) { continue; }
            {
                let mut awake = AWAKE.lock().unwrap();
                if m.report_id != 0 && s.asleep && !awake.contains(&m.pid) { continue; }
                if m.report_id != 0 && !s.asleep { awake.insert(m.pid); }
            }
            add_once(ctx, &mut seen, &s);
            ctx.claim(0x0B05, m.pid);
            break;
        }
    }
}
