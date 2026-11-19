//! Corsair wireless headsets, mice and keyboards (VID 1B1C).
//!  * Void / Void Pro / Void Elite / HS70 / HS80 family: output C9 64 -> [2] % (bit 7 = mic up), [4] status
//!    (0 offline, 1-2 ok, 4-5 charging). From github.com/Sapd/HeadsetControl.
//!  * "Bragi" devices (Virtuoso, Void V2, HS80 MAX, Slipstream mice/keyboards): wire bytes
//!    02 <target> 02 <property> = GET; reply [1] source, [2] 02, [3] status (0 ok), [4..7] value LE.
//!    Property 0F = battery (0..1000), 10 = charge state (1 charging, 3 full), 12 = product id (as in OpenRGB). Target 08 is the device
//!    or receiver itself, 09+ are devices paired to a receiver. GET is read-only; we never switch the
//!    device into software mode.

use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{clamp100, guess_kind, hex4, hid_product, kind_from_collections, HidColl, HidIo, PollContext};
use crate::win::now_ms;

const K_VOID_PIDS: [u16; 18] = [0x1B1C, 0x1B27, 0x0A14, 0x0A16, 0x0A17, 0x0A1D, 0x0A1A, 0x1B2A, 0x1B23,
                                0x1B29, 0x0A55, 0x0A51, 0x0A52, 0x0A38, 0x0A4F, 0x0A2B, 0x0A75, 0x0A56];
const K_BRAGI_PIDS: [u16; 8] = [0x2A08, 0x2A02, 0x0A97, 0x0A64, 0x0A62, 0x0A3E, 0x0A3D, 0x2B00];

fn poll_void(ctx: &mut PollContext, c: &HidColl, s: &mut DeviceStatus) -> bool {
    let Some(mut d) = ctx.open(c) else { return false };
    d.flush();
    let mut r = Vec::new();
    if !d.write(&[0xC9, 0x64], 500) { return false; }
    let end = now_ms() + 1000;
    let left = (end as i64 - now_ms() as i64) as i32;
    if left <= 0 || d.read(&mut r, left as u32) < 5 { return false; }
    let st = r[4];
    s.key = format!("corsair:{}", hex4(c.pid));
    s.name = hid_product(c);
    if s.name.is_empty() { s.name = "Corsair wireless headset".into(); }
    s.kind = DeviceKind::Headset;
    s.via = "2.4 GHz receiver".into();
    s.connected = st != 0;
    s.charging = st == 4 || st == 5;
    if st == 1 || st == 2 || s.charging { s.percent = clamp100((r[2] & 0x7F) as i32); }
    true
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Mode { Unknown, Prefixed, Plain }

struct Bragi {
    d: Box<dyn HidIo>,
    numbered: bool,
    mode: Mode,
}

impl Bragi {
    // Returns true and sets `value` on success; `status` holds the reply status (0 = ok, 5 = no such property).
    // Two framings exist. "Prefixed" (older Bragi): 02 <target> 02 <prop>, reply 02 <source> 02 <status> <value>.
    // "Plain" (newer Slipstream receivers such as 1B1C:2B00, e.g. Scimitar Elite SE Wireless):
    // 00 <target> 02 <prop> (report ID 0), reply <source> 02 <status> <value>. The first framing that answers
    // is remembered for this handle.
    fn get(&mut self, target: u8, prop: u8, value: &mut u32, timeout_ms: u32) -> bool {
        if self.mode != Mode::Plain && self.get_framed(false, target, prop, value, timeout_ms) {
            self.mode = Mode::Prefixed;
            return true;
        }
        if self.mode == Mode::Prefixed { return false; }
        if self.get_framed(true, target, prop, value, timeout_ms) {
            self.mode = Mode::Plain;
            return true;
        }
        false
    }

    fn get_framed(&mut self, plain: bool, target: u8, prop: u8, value: &mut u32, timeout_ms: u32) -> bool {
        let req: Vec<u8> = if plain {
            vec![0x00, target, 0x02, prop]
        } else if self.numbered {
            vec![0x02, target, 0x02, prop]
        } else {
            vec![0x00, 0x02, target, 0x02, prop]
        };
        self.d.flush();
        if !self.d.write(&req, 500) { return false; }
        let source: u8 = if target == 0x08 { 0x00 } else { 0x01 };
        let o: usize = if plain { 0 } else { 1 };  // offset of the source byte in the reply
        let end = now_ms() + timeout_ms as u64;
        let mut r = Vec::new();
        loop {
            let left = (end as i64 - now_ms() as i64) as i32;
            if left <= 0 { return false; }
            let n = self.d.read(&mut r, left as u32);
            if n < 0 { return false; }
            if (n as usize) < o + 7 { continue; }
            if r[o + 1] != 0x02 || r[o] != source { continue; }  // notification or another app's reply
            if r[o + 2] != 0x00 { return false; }
            *value = r[o + 3] as u32 | (r[o + 4] as u32) << 8 | (r[o + 5] as u32) << 16 | (r[o + 6] as u32) << 24;
            return true;
        }
    }
}

// Devices seen behind a receiver, identified by the product ID they report (property 12).
struct PairedModel { pid: u16, name: &'static str, kind: DeviceKind }

static K_PAIRED_MODELS: &[PairedModel] = &[
    PairedModel { pid: 0x1B7E, name: "Corsair Dark Core RGB Pro SE", kind: DeviceKind::Mouse },  // tested on Slipstream receiver 1BDC
];

fn find_paired(pid: u32) -> Option<&'static PairedModel> {
    K_PAIRED_MODELS.iter().find(|m| m.pid as u32 == pid)
}

pub fn poll_corsair(ctx: &mut PollContext) {
    for &(vid, pid) in &ctx.products(0x1B1C) {
        if K_VOID_PIDS.contains(&pid) {
            for c in ctx.find(vid, pid, |c| (c.page() == 0xFFC5 || c.page() == 0xFF00) && c.out_len() > 0) {
                let mut s = DeviceStatus::default();
                if poll_void(ctx, &c, &mut s) {
                    ctx.add(s, vid, pid);
                    break;
                }
            }
            continue;
        }
        let known_bragi = K_BRAGI_PIDS.contains(&pid);
        let colls = ctx.find(vid, pid, |c: &HidColl| {
            let sizes = (c.out_len() == 64 || c.out_len() == 65) && (c.in_len() == 64 || c.in_len() == 65);
            sizes && (c.page() == 0xFF42 || (known_bragi && c.page() >= 0xFF00) || (known_bragi && c.iface == 4))
        });
        for c in colls {
            let Some(d) = ctx.open(&c) else { continue };
            let mut b = Bragi { d, numbered: c.out_len() == 64, mode: Mode::Unknown };
            let mut any = false;
            let product = hid_product(&c);
            // Paired devices behind a receiver first, then the device itself (wired / Bluetooth).
            for target in [0x09u8, 0x0A, 0x0B, 0x08] {
                if target == 0x08 && any { break; }
                let mut level: u32 = 0;
                let mut ok = b.get(target, 0x0F, &mut level, 300);
                let mut retry = 0;
                while ok && (level == 0 || level > 1000) && retry < 2 {
                    ok = b.get(target, 0x0F, &mut level, 300);
                    retry += 1;
                }
                if !ok || level > 1000 { continue; }
                let mut s = DeviceStatus::default();
                s.key = format!("corsair:{}:{}", hex4(pid), target);
                s.name = if product.is_empty() { "Corsair wireless device".into() } else { product.clone() };
                s.kind = guess_kind(&s.name);
                // A receiver names itself, not the device behind it, and has mouse collections of its own.
                // Property 12 is the paired device's product id (read-only); Corsair headsets use 0Axx.
                let mut dev_pid: u32 = 0;
                if target != 0x08 && b.get(target, 0x12, &mut dev_pid, 300) {
                    if let Some(m) = find_paired(dev_pid) {
                        s.name = m.name.into();
                        s.kind = m.kind;
                    } else if (dev_pid >> 8) == 0x0A {
                        s.kind = DeviceKind::Headset;
                        if product.contains("Receiver") { s.name = "Corsair wireless headset".into(); }
                    }
                }
                // Corsair headsets and their receivers use product ids 0Axx (HS80 RGB receiver 0A6B names
                // itself "... Wireless Gaming Receiver", and its collections look like a keyboard).
                if s.kind == DeviceKind::Other && (pid >> 8) == 0x0A { s.kind = DeviceKind::Headset; }
                if s.kind == DeviceKind::Other { s.kind = kind_from_collections(&ctx.colls, vid, pid); }
                s.via = if target == 0x08 { "USB / Bluetooth" } else { "Corsair receiver" }.into();
                s.percent = clamp100(((level + 5) as i32) / 10);
                let mut charge: u32 = 0;
                if b.get(target, 0x10, &mut charge, 300) { s.charging = charge == 1 || charge == 3; }
                ctx.out.push(s);
                any = true;
            }
            if any { ctx.claim(vid, pid); break; }
        }
    }
}
