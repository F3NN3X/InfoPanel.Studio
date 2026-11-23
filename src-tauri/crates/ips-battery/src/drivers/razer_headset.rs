//! Razer BlackShark headsets with their own vendor protocol (not the 90-byte Razer feature report).
//!
//! BlackShark V3 / V3 Pro (1532:0576/0577 V3 Pro, 0579/057A V3), interface 5; V3 X further down.
//! 64-byte output report 02: [02][00][60][00 00][00][size][00 00][dir][class][sub][argc][args]..
//! [62] = XOR of bytes 0..61. GET battery = class 21 -> reply args [level %][charging].
//! The headset drops its 2.4 GHz link if the battery is queried every few seconds, so it is asked at
//! most once every 5 minutes and the last reading is reused in between.
//! Protocol from OpenRazer PR #2794 (docs/v3_pro_protocol.md) and github.com/ReedME/omarchy-blackshark-v3.
//!
//! BlackShark V2 Pro (2020), 2.4 GHz receiver 1532:0528, uses feature report FF on FF00:0001.
//! Request from https://github.com/openrazer/openrazer/issues/1280#issuecomment-1094116217.
//! Reply and power states documented in https://github.com/HeyOkay/HaloBattery/blob/main/providers/blackshark2020.py.
//!
//! BlackShark V2 Pro (2023), HyperSpeed dongle 1532:0555, vendor collection (usage page FF00).
//! 64-byte output report 02, "PA" envelope: [02][80][8+len][00 00]['P']['A'][08][00][type][cmd][flag][len].
//! Remote mode on/off = [02][80][07][00 00]['P']['A'][0E][00][02][E1][1/0]; Synapse asserts it around
//! every query, and the first frame after ~0.3 s idle only wakes the link, so one extra remote-on is
//! sent first. Query type 03: cmd 21 = battery 0-100, cmd 2A = charging (0 = on battery).
//! Reply: [02].. [12]=cmd echo [13]=01 ACK [14]=len [15..]=data.
//! Protocol from OpenRazer PR #2862 (driver/razerblackshark_driver.c, from a capture of 1532:0555)
//! and HaloBattery providers/blackshark.py.
//!
//! Barracuda X (2022), YS-Tech 2.4 GHz receiver 1532:0550, vendor collection FF00:0001, report id 02.
//! The receiver bridges USB HID to the headset's Airoha chip. Output report (64 bytes):
//! [02][80][len][crc lo][crc hi][payload..], crc = CRC-16/XMODEM over the whole report with the crc bytes zero.
//! After each write the bridge answers a GetInputReport(02) with [02]['O'] (taken) or [02]['F'] (busy).
//! Input reports are [02][len][stream..]; the stream carries frames [50 49][group][..][len lo][len hi]..
//! (10-byte header, payload length in bytes 8-9). Airoha command = [50 41][group][seq][body..].
//! Remote mode (group 0E, body 02 E1 01/00) makes the receiver forward commands to the headset; it is switched
//! on for one query and off again afterwards, like the BlackShark V2 Pro. The headset does not answer when it
//! is off, out of range or in Bluetooth mode. Customer data GET (group 08, body 03 <cmd> 00 00), reply op 01:
//! cmd 21 = battery 0-100, cmd 2A = cable (00 / 01).
//! Protocol from github.com/mehdibouchami/razer-barracuda-x-battery (YS-Tech framing) and
//! github.com/nightdevx/barracuda-x-battery (checked on a 1532:0550 receiver).

use std::collections::BTreeMap;
use std::sync::Mutex;

use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{HidColl, HidIo, PollContext, hex4};
use crate::win::{now_ms, sleep_ms};

const MIN_INTERVAL_MS: u64 = 5 * 60 * 1000;

fn packet(dir: u8, cls: u8) -> Vec<u8> {
    let mut b = vec![0u8; 64];
    b[0] = 0x02;
    b[2] = 0x60;
    b[6] = 0x04; // data size: dir, class, sub, argc
    b[9] = dir;
    b[10] = cls;
    let mut crc = 0u8;
    for i in 0..62 {
        crc ^= b[i];
    }
    b[62] = crc;
    b
}

fn get(d: &mut dyn HidIo, cls: u8, reply: &mut Vec<u8>) -> bool {
    if !d.write(&packet(0x80, cls), 500) {
        return false;
    }
    let end = now_ms() + 600;
    while (end as i64 - now_ms() as i64) > 0 {
        let left = (end as i64 - now_ms() as i64) as u32;
        if d.read(reply, left) < 15 {
            return false;
        }
        if reply[0] == 0x02 && reply[2] == 0x60 && reply[10] == cls {
            return true;
        }
    }
    false
}

struct Cached {
    at: u64,
    status: DeviceStatus,
    valid: bool,
}

// Last reading per pid, reused for 5 minutes (C++ g_cache; polls are single-threaded).
static CACHE: Mutex<BTreeMap<u16, Cached>> = Mutex::new(BTreeMap::new());

/// The cached status for `pid` when it is fresh enough to reuse (the C++ `g_cache[pid]` check).
fn cached_status(pid: u16) -> Option<DeviceStatus> {
    let cache = CACHE.lock().unwrap();
    let c = cache.get(&pid)?;
    (c.valid && now_ms() - c.at < MIN_INTERVAL_MS).then(|| c.status.clone())
}

fn store_cache(pid: u16, status: DeviceStatus) {
    CACHE.lock().unwrap().insert(pid, Cached { at: now_ms(), status, valid: true });
}

fn name(pid: u16) -> &'static str {
    if pid == 0x0576 || pid == 0x0577 { "Razer BlackShark V3 Pro" } else { "Razer BlackShark V3" }
}

// ---- BlackShark V2 HyperSpeed: MediaTek vendor HID (NOT V2 Pro PA protocol) ----------------------
// Based on justik13/razer-blackshark-v2-hyperspeed-webhid (MIT).
// Dongle 1532:0565, vendor collection usage page FF14 (FF00 fallback), usually interface 3.
// HID report: [02][00][60|seq][00 00 00][04][00][00][80][cmd][00][00]...[xor][00].
// Only GET 0x21 (battery) and GET 0x2A (charging) are issued; no settings are modified.

// C++ function-local statics -> module-level counters.
static HS_SEQ: Mutex<u8> = Mutex::new(0);

fn next_hs_seq() -> u8 {
    let mut seq = HS_SEQ.lock().unwrap();
    let s = *seq;
    *seq = seq.wrapping_add(1);
    0x60 | (s & 0x1F)
}

fn hs_query_frame(cmd: u8, seq: u8) -> Vec<u8> {
    let mut b = vec![0u8; 64];
    b[0] = 0x02; // report ID, excluded from WebHID payload, included in Win32 Write
    b[2] = seq;
    b[6] = 0x04; // GET request length
    b[9] = 0x80; // route from RF dongle to headset
    b[10] = cmd;
    let mut checksum = 0u8;
    for i in 0..62 {
        checksum ^= b[i];
    }
    b[62] = checksum;
    b
}

// The Win32 HID layer returns the report ID in r[0] for numbered reports.
// WebHID's payload offsets are therefore shifted by one here.
fn parse_hs_reply(r: &[u8], cmd: u8, seq: u8) -> Option<i32> {
    if r.len() < 64 || r[0] != 0x02 || r[2] != seq || r[10] != cmd || r[12] < 1 {
        return None;
    }
    let mut checksum = 0u8;
    for i in 1..62 {
        checksum ^= r[i];
    }
    if checksum != r[62] {
        return None;
    }
    Some(r[13] as i32)
}

fn hs_query(d: &mut dyn HidIo, cmd: u8) -> i32 {
    let seq = next_hs_seq();
    d.flush();
    if !d.write(&hs_query_frame(cmd, seq), 500) {
        return -1;
    }
    let end = now_ms() + 650;
    let mut r: Vec<u8> = Vec::new();
    while now_ms() < end {
        let remaining = (end - now_ms()) as u32;
        if d.read(&mut r, remaining) < 0 {
            break;
        }
        if let Some(value) = parse_hs_reply(&r, cmd, seq) {
            return value;
        }
    }
    -1
}

fn poll_blackshark_v2_hyperspeed(ctx: &mut PollContext) {
    const PID: u16 = 0x0565; // 2.4 GHz dongle, not the wired 056E variant
    if ctx.is_claimed(0x1532, PID) {
        return;
    }
    let colls =
        ctx.find(0x1532, PID, |c| (c.page() == 0xFF14 || c.page() == 0xFF00) && c.usage() == 0x01 && c.out_len() >= 64 && c.in_len() >= 64);
    // Prefer the specific vendor control interface so audio/telephony endpoints are not touched.
    for c in &colls {
        if c.page() != 0xFF14 {
            continue;
        }
        let Some(mut d) = ctx.open(c) else { continue };
        let level = hs_query(&mut d, 0x21);
        if level < 0 || level > 100 {
            continue;
        }
        let charging = hs_query(&mut d, 0x2A);
        ctx.add(
            DeviceStatus {
                key: format!("blackshark:{}", hex4(PID)),
                name: "Razer BlackShark V2 HyperSpeed".into(),
                kind: DeviceKind::Headset,
                via: "2.4 GHz receiver".into(),
                percent: level,
                charging: charging > 0,
                ..Default::default()
            },
            0x1532,
            PID,
        );
        return;
    }
    // Fallback for firmware exposing the control collection on FF00.
    for c in &colls {
        if c.page() != 0xFF00 {
            continue;
        }
        let Some(mut d) = ctx.open(c) else { continue };
        let level = hs_query(&mut d, 0x21);
        if level < 0 || level > 100 {
            continue;
        }
        let charging = hs_query(&mut d, 0x2A);
        ctx.add(
            DeviceStatus {
                key: format!("blackshark:{}", hex4(PID)),
                name: "Razer BlackShark V2 HyperSpeed".into(),
                kind: DeviceKind::Headset,
                via: "2.4 GHz receiver".into(),
                percent: level,
                charging: charging > 0,
                ..Default::default()
            },
            0x1532,
            PID,
        );
        return;
    }
}

fn poll_blackshark_v2_pro_2020(ctx: &mut PollContext) {
    const VID: u16 = 0x1532;
    const PID: u16 = 0x0528;
    const REPORT_LEN: u16 = 64;
    const MAX_READS: i32 = 5;
    const REPLY: [u8; 9] = [0xFF, 0x0F, 0x05, 0xFE, 0x12, 0x04, 0x1F, 0x08, 0x05];
    const STALE: [u8; 9] = [0xFF, 0x01, 0x00, 0xFE, 0x12, 0x04, 0x1F, 0x08, 0x05];
    if ctx.is_claimed(VID, PID) {
        return;
    }
    let colls = ctx.find(VID, PID, |c| c.iface == 3 && c.page() == 0xFF00 && c.usage() == 0x0001 && c.feat_len() == REPORT_LEN);
    for c in &colls {
        let Some(mut d) = ctx.open_feature_only(c) else { continue };
        if !d.set_feature(&[0xFF, 0x0A, 0x00, 0xFD, 0x04, 0x12, 0xF1, 0x02, 0x05]) {
            continue;
        }

        let mut r: Vec<u8> = Vec::new();
        for read in 0..MAX_READS {
            sleep_ms(100); // Synapse waits about 100 ms for the receiver to fetch headset status.
            if !d.get_feature(0xFF, &mut r) || r.len() != REPORT_LEN as usize {
                continue;
            }
            let fresh = r.starts_with(&REPLY);
            // Give an in-flight request time to replace the old payload before reporting offline.
            let offline = read == MAX_READS - 1 && r.starts_with(&STALE);
            if !fresh && !offline {
                continue;
            }

            let mut s = DeviceStatus {
                key: format!("blackshark:{}", hex4(PID)),
                name: "Razer BlackShark V2 Pro (2020)".into(),
                kind: DeviceKind::Headset,
                via: "2.4 GHz receiver".into(),
                ..Default::default()
            };
            s.millivolts = if fresh { ((r[12] as i32) << 8) | r[13] as i32 } else { 0 };
            s.connected = s.millivolts != 0;
            if s.connected {
                s.charging = r[11] == 0x09;
                // The receiver can jump to 80% as soon as charging starts, even from 10%.
                if !s.charging && r[14] <= 100 {
                    s.percent = r[14] as i32;
                }
            }
            ctx.add(s, VID, PID);
            return;
        }
    }
}

// ---- BlackShark V2 Pro (2023): "PA" envelope ----------------------------------------------------

fn pa_frame(total_len: u8, inner_len: u8, kind: u8, cmd: u8, flag: u8) -> Vec<u8> {
    let mut b = vec![0u8; 64];
    b[0] = 0x02;
    b[1] = 0x80;
    b[2] = total_len;
    b[5] = b'P';
    b[6] = b'A';
    b[7] = inner_len;
    b[9] = kind;
    b[10] = cmd;
    b[11] = flag;
    b
}

fn pa_remote(d: &mut dyn HidIo, on: bool) -> bool {
    let ok = d.write(&pa_frame(0x07, 0x0E, 0x02, 0xE1, u8::from(on)), 500);
    sleep_ms(35);
    ok
}

// Query one value; returns the first payload byte, or -1 when the headset does not answer.
fn pa_query(d: &mut dyn HidIo, cmd: u8) -> i32 {
    d.flush();
    pa_remote(d, true); // sacrificial: wakes a dozing link
    let mut value: i32 = -1;
    for _attempt in 0..3 {
        if value >= 0 {
            break;
        }
        pa_remote(d, true);
        if !d.write(&pa_frame(0x08, 0x08, 0x03, cmd, 0), 500) {
            break;
        }
        let end = now_ms() + 150;
        let mut r: Vec<u8> = Vec::new();
        while (end as i64 - now_ms() as i64) > 0 {
            let left = (end as i64 - now_ms() as i64) as u32;
            if d.read(&mut r, left) < 16 {
                break;
            }
            if r[0] == 0x02 && r[12] == cmd && r[13] == 0x01 && r[14] >= 1 {
                value = r[15] as i32;
                break;
            }
        }
    }
    pa_remote(d, false);
    value
}

fn poll_blackshark_v2_pro_2023(ctx: &mut PollContext) {
    let pid: u16 = 0x0555;
    if ctx.is_claimed(0x1532, pid) {
        return;
    }
    let colls = ctx.find(0x1532, pid, |c| c.page() == 0xFF00 && c.out_len() >= 64 && c.in_len() >= 16);
    for c in &colls {
        let Some(mut d) = ctx.open(c) else { continue };
        let level = pa_query(&mut d, 0x21);
        if level < 0 || level > 100 {
            continue;
        }
        let charging = pa_query(&mut d, 0x2A);
        ctx.add(
            DeviceStatus {
                key: format!("blackshark:{}", hex4(pid)),
                name: "Razer BlackShark V2 Pro (2023)".into(),
                kind: DeviceKind::Headset,
                via: "2.4 GHz receiver".into(),
                percent: level,
                charging: charging > 0,
                ..Default::default()
            },
            0x1532,
            pid,
        );
        return;
    }
}

// ---- Barracuda X (2022), YS-Tech receiver 1532:0550 ---------------------------------------------

fn crc16_xmodem(data: &[u8]) -> u16 {
    let mut crc: u16 = 0;
    for &b in data {
        crc ^= (b as u16) << 8;
        for _ in 0..8 {
            crc = if crc & 0x8000 != 0 { (crc << 1) ^ 0x1021 } else { crc << 1 };
        }
    }
    crc
}

const K_MAGIC: [u8; 2] = [0x50, 0x49];

struct BarracudaLink {
    dev: Box<dyn HidIo>,
    stream: Vec<u8>,
    seq: u8,
}

impl BarracudaLink {
    fn open(ctx: &mut PollContext, c: &HidColl) -> Option<BarracudaLink> {
        Some(BarracudaLink { dev: ctx.open(c)?, stream: Vec::new(), seq: 0 })
    }

    // Sends one Airoha command [50 41][group][seq][body..]; the sequence number is kept in seq.
    fn command(&mut self, group: u8, body: &[u8]) -> bool {
        self.seq = self.seq % 127 + 1;
        let mut payload: Vec<u8> = vec![0x50, 0x41, group, self.seq];
        payload.extend_from_slice(body);
        let mut f = vec![0u8; 64];
        f[0] = 0x02;
        f[1] = 0x80;
        f[2] = payload.len() as u8;
        f[5..5 + payload.len()].copy_from_slice(&payload);
        let crc = crc16_xmodem(&f); // crc over the whole report with the crc bytes zero
        f[3] = (crc & 0xFF) as u8;
        f[4] = (crc >> 8) as u8;
        for attempt in 0..5 {
            if attempt != 0 {
                sleep_ms(50);
            }
            let mut status: Vec<u8> = Vec::new();
            if !self.dev.write(&f, 500) || !self.dev.get_input_report(0x02, &mut status) || status.len() < 2 {
                return false;
            }
            if status[1] == b'O' {
                return true;
            }
            if status[1] != b'F' {
                return false; // anything but "taken" / "busy" means the bridge refused it
            }
        }
        false
    }

    // Waits for the first reply frame accepted by `pred`; unrelated frames (events, other
    // replies) are skipped.
    fn await_frame(&mut self, timeout_ms: u32, pred: impl Fn(&[u8]) -> bool, frame: &mut Vec<u8>) -> bool {
        let end = now_ms() + timeout_ms as u64;
        loop {
            while self.stream.len() >= 2 {
                // Drop everything before the next [50 49] frame header (all of it when absent).
                let start = self.stream.windows(2).position(|w| w == K_MAGIC.as_slice()).unwrap_or(self.stream.len());
                self.stream.drain(..start);
                if self.stream.len() < 10 {
                    break;
                }
                let len = 10 + (self.stream[8] as usize | ((self.stream[9] as usize) << 8));
                if self.stream.len() < len {
                    break;
                }
                frame.clear();
                frame.extend_from_slice(&self.stream[..len]);
                self.stream.drain(..len);
                if pred(frame) {
                    return true;
                }
            }
            let left = end as i64 - now_ms() as i64;
            let mut r: Vec<u8> = Vec::new();
            if left <= 0 || self.dev.read(&mut r, left as u32) < 2 {
                return false;
            }
            if r[0] == 0x02 && r[1] as usize + 2 <= r.len() {
                let n = r[1] as usize;
                self.stream.extend_from_slice(&r[2..2 + n]);
            }
        }
    }

    // Remote mode on/off. Returns true when the headset acknowledged it (status 0).
    fn remote_mode(&mut self, on: bool) -> bool {
        let mut f: Vec<u8> = Vec::new();
        if !self.command(0x0E, &[0x02, 0xE1, u8::from(on)]) {
            return false;
        }
        let seq = self.seq;
        self.await_frame(800, |r| r.len() >= 13 && r[10] == 0x0E && r[11] == 0x80 | seq, &mut f) && f[12] == 0
    }

    // Customer-data GET: the first value byte, or -1 when the headset does not answer.
    fn get(&mut self, cmd: u8) -> i32 {
        let mut f: Vec<u8> = Vec::new();
        if !self.command(0x08, &[0x03, cmd, 0x00, 0x00]) {
            return -1;
        }
        let ok = self.await_frame(1000, |r| r.len() >= 13 && r[2] == 0x08 && r[10] == cmd && r[11] == 0x01, &mut f);
        if ok && f[12] >= 1 && f.len() >= 14 { f[13] as i32 } else { -1 }
    }
}

fn poll_barracuda_x(ctx: &mut PollContext) {
    let pid: u16 = 0x0550;
    if ctx.is_claimed(0x1532, pid) {
        return;
    }
    let colls = ctx.find(0x1532, pid, |c| c.page() == 0xFF00 && c.usage() == 0x0001 && c.out_len() >= 64 && c.in_len() >= 64);
    for c in &colls {
        let Some(mut link) = BarracudaLink::open(ctx, c) else { continue };
        // Receiver without a connected headset (off, out of range, Bluetooth mode).
        if !link.remote_mode(true) {
            continue;
        }
        let level = link.get(0x21);
        let cable = if level >= 0 { link.get(0x2A) } else { -1 };
        link.remote_mode(false);
        if level < 0 || level > 100 {
            continue;
        }
        ctx.add(
            DeviceStatus {
                key: format!("barracuda:{}", hex4(pid)),
                name: "Razer Barracuda X (2022)".into(),
                kind: DeviceKind::Headset,
                via: "2.4 GHz receiver".into(),
                percent: level,
                charging: cable == 1,
                ..Default::default()
            },
            0x1532,
            pid,
        );
        return;
    }
}

// BlackShark V3 X (1532:057D HyperSpeed dongle, 057C cable): a different protocol on interface 0.
// 64-byte feature report 07: [07][status][txid][00 00 00][argc][class][cmd][args].. [62] = XOR of 3..60.
// Battery = class 07 cmd 80 -> args[1] is the level %; cmd 84 -> args[1] is charging.
// Status 02 = success, 01 = busy; anything else (e.g. headset off) is a failure.
// Protocol from OpenRazer PR #2899, verified on a 057D dongle.

static V3X_TXID: Mutex<u8> = Mutex::new(0x40);

fn v3x_get(d: &mut dyn HidIo, cmd: u8) -> Option<u8> {
    for _attempt in 0..4 {
        let mut req = vec![0u8; 64];
        req[0] = 0x07;
        let txid = {
            let mut t = V3X_TXID.lock().unwrap();
            *t = t.wrapping_add(1); // C++ ++txid, wrapping like the BYTE original
            *t
        };
        req[2] = txid;
        req[6] = 0x02;
        req[7] = 0x07;
        req[8] = cmd;
        let mut crc = 0u8;
        for i in 3..=60 {
            crc ^= req[i];
        }
        req[62] = crc;
        if !d.set_feature(&req) {
            return None;
        }
        sleep_ms(60);
        let mut r: Vec<u8> = Vec::new();
        if !d.get_feature(0x07, &mut r) || r.len() < 63 {
            continue;
        }
        if r[2] != txid || r[7] != 0x07 || r[8] != cmd || r[6] < 2 {
            continue;
        }
        if r[1] != 0x02 && r[1] != 0x01 {
            return None;
        }
        return Some(r[10]);
    }
    None
}

fn poll_blackshark_v3x(ctx: &mut PollContext) {
    for pid in [0x057Du16, 0x057C] {
        if ctx.is_claimed(0x1532, pid) {
            continue;
        }
        let colls = ctx.find(0x1532, pid, |c| c.iface == 0 && c.feat_len() >= 64);
        if colls.is_empty() {
            continue;
        }
        if let Some(status) = cached_status(pid) {
            ctx.add(status, 0x1532, pid);
            continue;
        }
        let Some(mut d) = ctx.open_feature_only(&colls[0]) else { continue };
        let level = match v3x_get(&mut d, 0x80) {
            Some(v) => v,
            None => continue,
        };
        if level > 100 {
            continue;
        }
        let charging = v3x_get(&mut d, 0x84).unwrap_or(0);
        let s = DeviceStatus {
            key: format!("blackshark:{}", hex4(pid)),
            name: "Razer BlackShark V3 X".into(),
            kind: DeviceKind::Headset,
            via: (if pid == 0x057D { "2.4 GHz receiver" } else { "USB cable" }).into(),
            percent: level as i32,
            charging: charging == 1,
            ..Default::default()
        };
        store_cache(pid, s.clone());
        ctx.add(s, 0x1532, pid);
    }
}

pub fn poll_razer_headsets(ctx: &mut PollContext) {
    poll_blackshark_v2_hyperspeed(ctx);
    poll_barracuda_x(ctx);
    poll_blackshark_v2_pro_2020(ctx);
    poll_blackshark_v2_pro_2023(ctx);
    poll_blackshark_v3x(ctx);
    for pid in [0x0576u16, 0x0577, 0x0579, 0x057A] {
        if ctx.is_claimed(0x1532, pid) {
            continue;
        }
        let colls = ctx.find(0x1532, pid, |c| c.iface == 5 && c.out_len() >= 64 && c.in_len() >= 15);
        if colls.is_empty() {
            continue;
        }
        if let Some(status) = cached_status(pid) {
            ctx.add(status, 0x1532, pid);
            continue;
        }
        let Some(mut d) = ctx.open(&colls[0]) else { continue };
        // Handshake the headset expects before reads (init, charging state on both links).
        d.write(&packet(0x00, 0x02), 500);
        d.write(&packet(0x00, 0x2A), 500);
        d.write(&packet(0x80, 0x2A), 500);
        sleep_ms(250);
        d.flush();
        let mut r: Vec<u8> = Vec::new();
        if !get(&mut d, 0x21, &mut r) || r[13] > 100 {
            continue;
        }
        let s = DeviceStatus {
            key: format!("blackshark:{}", hex4(pid)),
            name: name(pid).into(),
            kind: DeviceKind::Headset,
            via: "2.4 GHz receiver".into(),
            percent: r[13] as i32,
            charging: r[14] != 0,
            ..Default::default()
        };
        store_cache(pid, s.clone());
        ctx.add(s, 0x1532, pid);
    }
}
