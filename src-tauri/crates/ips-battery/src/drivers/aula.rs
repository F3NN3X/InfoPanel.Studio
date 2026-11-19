//! AULA F75 / F87 Pro / F99 and MCHOSE (K99 V2, G75 Pro, X75 ...) wireless keyboards on the "BY"
//! 2.4 GHz receivers: 3554:FA09 (Compx, shared by both brands) and MCHOSE's own 41E4:2001.
//! The receiver exposes a 20-byte vendor collection (usage page FF02 or FF04, usage 02). Battery is a
//! 20-byte output report 0x13 carrying command 0x4A and a trailing sum checksum. The reply is
//! another 0x13 frame whose command byte, with its top bit masked, is 0x4A. Its payload starts at
//! byte 5: the level (1..100), then the state byte (low nibble: full, high nibble: charging; AULA
//! reports 0x01 on battery and 0x10 with the cable in).
//! The receiver also pushes unrelated 0x13 frames (a 0x0A status among them), so the report id
//! alone does not identify the reply. MCHOSE firmware leaves the reply's trailer at 0 instead of a
//! checksum; such a reply is accepted only as a single-packet frame (byte 2 = 1 packet, byte 3 = index 0).
//! A keyboard that is dozing or has just switched to 2.4 GHz leaves the first request unanswered
//! (one F75 capture timed out at exactly 1 s), so the request is resent every ~1.3 s within one
//! 4-second deadline, the documented exception for slow links. Byte 2 alternates between 00 (PyFlat,
//! sanshoku captures on the F75) and 01 (the "packet count" the Womier L65 tool sends on the same
//! receiver); the reply is identified by command and checksum either way.
//! Receivers named "2.4G Wireless Receiver" / "MCHOSE 2.4G Wireless" are first asked for their
//! six-byte model code (command 0x05, read-only), as MCHOSE's M HUB does, to tell an MCHOSE model
//! apart; MCHOSE models then get M HUB's exact battery frame (13 4A 01 ...).
//! AULA protocol from github.com/PyFlat/Device-Battery-Info (PR 6), github.com/deepan-alve/womier-l65-linux
//! (windows/l65w.ps1) and github.com/ushineko/sanshoku issue 36.
//! MCHOSE receiver ids, model codes and frames from the official M HUB web driver
//! (www.mchose.com.cn, assets/main-DQZs6ZzX.js: HidIndexDeviceFilters, getDevName, keyboardPwds,
//! getPassWord, getBattery, getBatteryParser), as also documented in
//! github.com/wushuai0802/myfinder-device-battery (engine/upstream-protocols.md, sections
//! "MCHOSE BY keyboard receiver 3554:FA09" and "MCHOSE 41E4:2001 and other 41E4 identities").
//!
//! AULA HERO 68 Air (and possibly other AULA keyboards) on the "8K Wireless Receiver" (VID 372E,
//! PID 106C) speaks a different, acknowledged protocol on usage page FF60 / usage 61 (interface 2):
//!  * 20-byte reports: 09 66, three control bytes, 14 payload bytes, checksum.
//!    Byte 3 (low 7 bits) is the frame index 1..5, byte 4 (low 7 bits) the frame type:
//!    0E data, 00 ACK, 08 trailer from the host, 07 trailer from the keyboard. The top bits of
//!    bytes 2, 3 and 4 form a 3-bit counter that advances with every frame a side sends.
//!    Data frame checksum: byte 19 = sum of bytes 1..18.
//!  * A message is always 4 data frames (56 bytes) plus a trailer. Host trailer: byte 12 =
//!    0xFF - sum of the 56 message bytes, byte 13 = sum of bytes 1..12.
//!  * Every data and trailer frame is acknowledged by the other side: bytes 2..4 echoed with the
//!    type bits cleared (counter bit kept), byte 5 = sum of bytes 1..4. Unacknowledged frames are
//!    resent by the keyboard every ~100 ms.
//!  * Battery request: message 09 87 00 00 01 00. Reply: 87 00 00 01 00 02 <level> <flags>; the 02
//!    is constant (it does not change with charging). The keyboard also pushes FE 05 <level> <flags>
//!    on its own. <flags> is 0x10 while charging on the cable and 0x00 on battery.
//! From a USB capture of AULA Hub (batterymon-proto issue #201); read-only.

use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{hex4, hid_product, HidIo, PollContext};
use crate::win::now_ms;

const RECEIVERS: [(u16, u16); 3] = [(0x3554, 0xFA09), (0x3554, 0xFB40), (0x41E4, 0x2001)];

/// M HUB's keyboardPwds table: the six-byte model code returned by command 0x05.
struct Model {
    code: [u8; 6],
    name: &'static str,
}

const MODELS: [Model; 18] = [
    Model { code: [0x03, 0x00, 0x00, 0x00, 0x02, 0x1C], name: "MCHOSE G87" },
    Model { code: [0x03, 0x00, 0x00, 0x00, 0x00, 0x77], name: "MCHOSE K99" },
    Model { code: [0x03, 0x00, 0x00, 0x00, 0x01, 0xDF], name: "MCHOSE K99 V2" },
    Model { code: [0x03, 0x00, 0x00, 0x00, 0x01, 0x32], name: "MCHOSE G98" },
    Model { code: [0x03, 0x00, 0x00, 0x00, 0x00, 0xD6], name: "MCHOSE X75" },
    Model { code: [0x0A, 0x00, 0x00, 0x00, 0x00, 0x03], name: "MCHOSE G98 Pro" },
    Model { code: [0x03, 0x00, 0x00, 0x00, 0x01, 0xC6], name: "MCHOSE X75 V2" },
    Model { code: [0x03, 0x00, 0x00, 0x00, 0x01, 0x15], name: "MCHOSE G75 Pro" },
    Model { code: [0x0A, 0x00, 0x00, 0x00, 0x00, 0x18], name: "MCHOSE G98 V2" },
    Model { code: [0x0A, 0x00, 0x00, 0x00, 0x00, 0x2B], name: "MCHOSE UT98" },
    Model { code: [0x0A, 0x00, 0x00, 0x00, 0x00, 0x01], name: "MCHOSE Z75" },
    Model { code: [0x0A, 0x00, 0x00, 0x00, 0x00, 0x09], name: "MCHOSE Z75S" },
    Model { code: [0x03, 0x00, 0x00, 0x00, 0x01, 0xC7], name: "MCHOSE KX75" },
    Model { code: [0x03, 0x00, 0x00, 0x00, 0x01, 0x74], name: "MCHOSE GX87" },
    Model { code: [0x03, 0x00, 0x00, 0x00, 0x01, 0xED], name: "MCHOSE GX87 V2" },
    Model { code: [0x03, 0x00, 0x00, 0x00, 0x01, 0x35], name: "MCHOSE K87" },
    Model { code: [0x03, 0x00, 0x00, 0x00, 0x03, 0x35], name: "MCHOSE G75 V2" },
    Model { code: [0x0A, 0x00, 0x00, 0x00, 0x00, 0x34], name: "MCHOSE G87 V2" },
];

/// Sum of the first `n` bytes.
fn sum(b: &[u8], n: usize) -> u8 {
    let mut s: u32 = 0;
    for i in 0..n { s += b[i] as u32; }
    (s & 0xFF) as u8
}

fn send_request(d: &mut dyn HidIo, cmd: u8, packets: u8) -> bool {
    let mut req = vec![0u8; 20];
    req[0] = 0x13;
    req[1] = cmd;
    req[2] = packets;
    req[19] = sum(&req, 19);
    d.write(&req, 500)
}

/// Sends 13 <cmd> ... and waits for the matching reply, resending every 1.3 s within `total_ms`.
fn exchange(d: &mut dyn HidIo, cmd: u8, r: &mut Vec<u8>, total_ms: i32) -> bool {
    let start = now_ms();
    let end = start + total_ms as u64;  // single absolute deadline
    let (start_i, end_i) = (start as i64, end as i64);
    const RESEND_MS: i64 = 1300;
    let mut sent: i64 = 0;
    d.flush();
    loop {
        let now = now_ms() as i64;
        if now >= end_i { return false; }
        if now >= start_i + sent * RESEND_MS {
            if !send_request(d, cmd, (sent & 1) as u8) { return false; }
            sent += 1;
        }
        let next_send = start_i + sent * RESEND_MS;
        let mut wait = (next_send.min(end_i) - now) as i32;
        if wait < 1 { wait = 1; }
        let before = now_ms();
        let n = d.read(r, wait as u32);
        // A read that fails at once is an I/O error (receiver unplugged), not a timeout: stop.
        if n < 0 && (now_ms() - before) as i32 + 20 < wait { return false; }
        if n < 20 { continue; }  // timeout (resend or give up above) or a short unrelated report
        if r[0] != 0x13 { continue; }
        if (r[1] & 0x7F) != cmd { continue; }  // the receiver also pushes unrelated 0x13 frames
        if r[4..19].iter().all(|&b| b == 0) { continue; }  // echo of a request
        let checksum = r[19] == sum(r, 19);
        let mchose = r[19] == 0 && r[2] == 1 && r[3] == 0;  // MCHOSE leaves the trailer at 0
        if !checksum && !mchose { continue; }
        return true;
    }
}

/// M HUB reads the model code from bytes 5..10. One user capture (myfinder-device-battery issue 476)
/// had it one byte earlier, so byte 4 is tried too. A code that matches neither leaves the model unknown.
fn identify_model(d: &mut dyn HidIo) -> Option<&'static str> {
    let mut r: Vec<u8> = Vec::new();
    if !exchange(d, 0x05, &mut r, 1300) { return None; }
    for off in [5usize, 4usize] {
        for m in &MODELS {
            let code: &[u8] = &m.code;
            if code == &r[off..off + 6] { return Some(m.name); }
        }
    }
    None
}

// --- HERO 68 Air / 8K Wireless Receiver (372E:106C) ---

const HERO_ID: u8 = 0x09;
const HERO_MAGIC: u8 = 0x66;
const HERO_DATA: u8 = 0x0E;
const HERO_ACK: u8 = 0x00;
const HERO_TRAILER_HOST: u8 = 0x08;
const HERO_TRAILER_DEV: u8 = 0x07;
const HERO_DEADLINE_MS: u64 = 1000;  // the whole exchange takes ~30 ms when the keyboard is awake
const HERO_RESEND_MS: u64 = 150;     // resend a frame the keyboard has not acknowledged yet

/// Sum of bytes `from..to` (to exclusive).
fn sum_range(b: &[u8], from: usize, to: usize) -> u8 {
    let mut s: u32 = 0;
    for i in from..to { s += b[i] as u32; }
    (s & 0xFF) as u8
}

/// Bytes 0..4 of a frame; the 3-bit counter lives in the top bits of bytes 2, 3 and 4.
fn hero_header(counter: i32, index: u8, typ: u8) -> Vec<u8> {
    let mut f = vec![0u8; 20];
    f[0] = HERO_ID;
    f[1] = HERO_MAGIC;
    f[2] = 0x05 | if (counter & 4) != 0 { 0x80 } else { 0 };
    f[3] = index | if (counter & 2) != 0 { 0x80 } else { 0 };
    f[4] = typ | if (counter & 1) != 0 { 0x80 } else { 0 };
    f
}

fn hero_data_frame(counter: i32, index: u8, msg: &[u8]) -> Vec<u8> {
    let mut f = hero_header(counter, index, HERO_DATA);
    for i in 0..14usize { f[5 + i] = msg[(index as usize - 1) * 14 + i]; }
    f[19] = sum_range(&f, 1, 19);
    f
}

fn hero_trailer(counter: i32, msg: &[u8]) -> Vec<u8> {
    let mut f = hero_header(counter, 5, HERO_TRAILER_HOST);
    f[12] = 0xFF - sum_range(msg, 0, msg.len());
    f[13] = sum_range(&f, 1, 13);
    f
}

fn hero_ack(r: &[u8]) -> Vec<u8> {
    let mut f = vec![0u8; 20];
    f[0] = HERO_ID;
    f[1] = HERO_MAGIC;
    f[2] = r[2];
    f[3] = r[3];
    f[4] = r[4] & 0x80;
    f[5] = sum_range(&f, 1, 5);
    f
}

fn is_ack_for(r: &[u8], f: &[u8]) -> bool {
    (r[4] & 0x7F) == HERO_ACK && r[2] == f[2] && r[3] == f[3] && (r[4] & 0x80) == (f[4] & 0x80)
        && r[5] == sum_range(r, 1, 5)
}

struct HeroLink<'a> {
    d: &'a mut dyn HidIo,
    end: u64,
    level: i32,
    flags: i32,  // the byte after the level, 0x10 while charging
    in_reply: bool,
    reply_done: bool,
    io_error: bool,
}

impl<'a> HeroLink<'a> {
    fn new(d: &'a mut dyn HidIo) -> Self {
        HeroLink { d, end: now_ms() + HERO_DEADLINE_MS, level: -1, flags: -1,
                   in_reply: false, reply_done: false, io_error: false }
    }

    /// Sends the 4 data frames and the trailer, each one only after the previous was acknowledged.
    fn send_message(&mut self, msg: &[u8]) -> bool {
        let mut counter: i32 = 1;  // AULA Hub starts a session at 1 as well
        for i in 1u8..=4 {
            if !self.send_frame(&hero_data_frame(counter, i, msg)) { return false; }
            counter = (counter + 1) & 7;
        }
        self.send_frame(&hero_trailer(counter, msg))
    }

    /// Reads (and acknowledges) the keyboard's frames until the reply has been received in full.
    fn wait_for_battery(&mut self) -> bool {
        let mut r: Vec<u8> = Vec::new();
        while !(self.level >= 0 && self.reply_done) {
            let rem = self.remaining();
            if !self.read_frame(&mut r, rem) { break; }
        }
        self.level >= 0
    }

    fn level(&self) -> i32 { self.level }
    fn charging(&self) -> bool { self.flags >= 0 && (self.flags & 0x10) != 0 }

    fn remaining(&self) -> i32 {
        let left = self.end as i64 - now_ms() as i64;
        if left > 0 { left as i32 } else { 0 }
    }

    fn send_frame(&mut self, f: &[u8]) -> bool {
        let mut r: Vec<u8> = Vec::new();
        while self.remaining() > 0 {
            if !self.d.write(f, 500) { return false; }
            let resend_at = now_ms() + HERO_RESEND_MS;
            loop {
                let wait = ((resend_at as i64 - now_ms() as i64).min(self.remaining() as i64)) as i32;
                if wait <= 0 { break; }
                if !self.read_frame(&mut r, wait) {
                    if self.io_error { return false; }
                    break;
                }
                if is_ack_for(&r, f) { return true; }
            }
        }
        false
    }

    /// Reads one HERO frame, acknowledges keyboard data/trailer frames and picks up the battery.
    /// Returns false on timeout or I/O error.
    fn read_frame(&mut self, r: &mut Vec<u8>, mut wait_ms: i32) -> bool {
        loop {
            if wait_ms <= 0 { return false; }
            let before = now_ms();
            let n = self.d.read(r, wait_ms as u32);
            let took = (now_ms() - before) as i32;
            // A read that fails at once is an I/O error (receiver unplugged), not a timeout: stop.
            if n < 0 && took + 20 < wait_ms {
                self.io_error = true;
                return false;
            }
            if n < 0 { return false; }
            wait_ms -= took;
            if n < 20 || r[0] != HERO_ID || r[1] != HERO_MAGIC { continue; }  // unrelated report
            let typ = r[4] & 0x7F;
            if typ == HERO_DATA {
                if r[19] != sum_range(r, 1, 19) { continue; }  // damaged: no ACK, the keyboard resends
                let ack = hero_ack(r);
                self.d.write(&ack, 500);
                if (r[3] & 0x7F) == 1 { self.inspect(r); }
            } else if typ == HERO_TRAILER_DEV {
                let ack = hero_ack(r);
                self.d.write(&ack, 500);
                if self.in_reply { self.reply_done = true; }
                self.in_reply = false;
            }
            return true;
        }
    }

    /// First data frame of a keyboard message: payload starts at byte 5.
    fn inspect(&mut self, r: &[u8]) {
        self.in_reply = false;
        if r[5] == 0x87 && r[11] >= 1 && r[11] <= 100 {  // reply to our request
            self.level = r[11] as i32;
            self.flags = r[12] as i32;
            self.in_reply = true;
        } else if r[5] == 0xFE && r[6] == 0x05 && r[7] >= 1 && r[7] <= 100 && self.level < 0 {
            self.level = r[7] as i32;  // pushed by the keyboard on its own; keep waiting for the real reply
            self.flags = r[8] as i32;
        }
    }
}

fn query_hero_battery(d: &mut dyn HidIo, level: &mut i32, charging: &mut bool) -> bool {
    let mut msg = vec![0u8; 56];
    msg[0] = 0x09;
    msg[1] = 0x87;  // battery
    msg[4] = 0x01;
    d.flush();
    let mut link = HeroLink::new(d);
    if !link.send_message(&msg) { return false; }
    if !link.wait_for_battery() { return false; }
    *level = link.level();
    *charging = link.charging();
    true
}

pub fn poll_aula(ctx: &mut PollContext) {
    for &(vid, pid) in &RECEIVERS {
        if ctx.is_claimed(vid, pid) { continue; }
        for c in ctx.find(vid, pid, |c| {
            (c.page() == 0xFF02 || c.page() == 0xFF04) && c.usage() == 0x0002
                && c.out_len() >= 20 && c.in_len() >= 20
        }) {
            let Some(mut d) = ctx.open(&c) else { continue };
            // Only the generic receiver names carry a model code (M HUB asks no other device).
            let product = hid_product(&c);
            let generic = product.contains("2.4G Wireless Receiver")
                || product.contains("MCHOSE 2.4G Wireless");
            let model = if generic { identify_model(d.as_mut()) } else { None };
            let mchose = vid == 0x41E4 || model.is_some();
            let mut r: Vec<u8> = Vec::new();
            // Byte 2 alternates 00 / 01 on resends; M HUB sends 01, the AULA references 00.
            if !exchange(d.as_mut(), 0x4A, &mut r, 4000) { continue; }
            let level = r[5] as i32;
            if level < 1 || level > 100 { continue; }
            let name = if let Some(m) = model { m }
                       else if mchose { "MCHOSE wireless keyboard" }
                       else { "AULA wireless keyboard" };
            let s = DeviceStatus {
                key: format!("aula:{}:{}", hex4(vid), hex4(pid)),
                name: name.into(),
                kind: DeviceKind::Keyboard,
                via: "2.4 GHz receiver".into(),
                percent: level,
                charging: (r[6] >> 4) == 1,  // high nibble: AULA's 0x10 cable flag, M HUB's chargeStatus
                ..Default::default()
            };
            ctx.add(s, vid, pid);
            break;
        }
    }

    for &(vid, pid) in &ctx.products(0x372E) {
        if pid != 0x106C { continue; }  // HERO 68 Air "8K Wireless Receiver"; other 372E products are unknown
        for c in ctx.find(vid, pid, |c| {
            c.page() == 0xFF60 && c.usage() == 0x0061 && c.out_len() >= 20 && c.in_len() >= 20
        }) {
            let Some(mut d) = ctx.open(&c) else { continue };
            let mut level = -1;
            let mut charging = false;
            if !query_hero_battery(d.as_mut(), &mut level, &mut charging) { continue; }
            let s = DeviceStatus {
                key: format!("aula:{}:{}", hex4(vid), hex4(pid)),
                name: "AULA wireless keyboard".into(),
                kind: DeviceKind::Keyboard,
                via: "2.4 GHz receiver".into(),
                percent: level,
                charging,
                ..Default::default()
            };
            ctx.add(s, vid, pid);
            break;
        }
    }
}
