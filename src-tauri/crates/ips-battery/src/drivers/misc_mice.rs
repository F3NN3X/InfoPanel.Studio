//! Smaller mouse brands, each with a community-documented battery protocol:
//!  * Motospeed X6 (Realtek VID 0BDA, receivers FFE0 / FFF2, interface 4): output report B5 [06],
//!    reply report B4, byte 20 = level (+128 while charging). The cable (FFF1) reports no battery.
//!    From github.com/Jacobz888/LGSTrayBattery-MotospeedX6.
//!  * Xenta receivers (Delux M900 Pro, Attack Shark X6 / R1 / X11 / X3 Max / V3 Pro / V6; VID 1D57):
//!    the receiver broadcasts input report 03 on usage page 000A every ~2 s:
//!    [03][model][40][state][percent], state 2 = full, 3 = charging (percent frozen).
//!    From github.com/AeonArcHQ/omarchy-delux-m900.
//!    The Attack Shark V6 (model 24) sends 41 instead of 40 in byte 2 ("03 24 41 01 64" on battery
//!    at 100%, read from a 1D57:FA60 receiver), so both values are accepted.
//!    The collection is push-only (no output or feature report), so it is opened read-only, as
//!    BatteryTray and attackshark-battery-windows do: a read/write open fails while a vendor app
//!    holds it without sharing write access. `--dump` also prints the raw frames it sends (see
//!    rongyuan::dump_xenta_frames), to add models such as the Moxanic Lumi G1 whose receiver
//!    (1D57:FA60) was not read yet.
//!  * Ajazz AJ179 family (VID 249A receiver, 248A cable, interface 2): unnumbered 32-byte report,
//!    command 10 (device info, answered by the receiver): reply [10][00 = ok]..., [4..7] model id,
//!    [12] charging, [13] percent, [14] mouse connected (receiver), [31] = sum([4..30]).
//!    From github.com/Rockeyxx/aj179-linux (docs/PROTOCOL.md).
//!  * AJAZZ AJ-series mice on the SONiX vendor id 3151 (AJ159 PRO / APEX and siblings). The dongle
//!    exposes a 65-byte feature collection on usage page FFFF / usage 02. A SET_FEATURE status poll
//!    (report 0x00, opcode 0xF7, zero payload) brings the 2.4 GHz telemetry link up; ~30 ms later
//!    GET_FEATURE report 0x05 carries the charge in byte 3 (0..100). A frame with a non-zero byte 1
//!    or 2 is transient reconnect garbage and is rejected.
//!    From github.com/Aiacos/ajazz-control-center (docs/protocols/mouse/aj_series.md).
//!  * AJAZZ AJ139 V2 MC and siblings on PID 2255 (VID A8A5 = 2.4 GHz dongle, A8A4 = USB cable; the
//!    PID is shared with the K-snake X11 and NJ07/NJ08 V2, so the mouse gets a generic name). Vendor
//!    collection FF01:0010, unnumbered 64-byte output/input reports: request
//!    [55][30][A5][chk][2E][00 ...], reply [AA][30]..., byte 8 = percent, byte 9 = non-zero on USB
//!    power. Unrelated AA FA / AA ED reports are skipped. The two sources disagree on request byte
//!    3: werquess sends the low byte of sum(bytes 4..63) (2E) and nico2525nn sends 0B with 01 01 in
//!    bytes 5..6, so both variants are tried.
//!    From github.com/werquess/ajazz-aj139-macos (PROTOCOL.md) and github.com/nico2525nn/AjazzAJ139V2.
//!  * Incott G23 V2 / G24 on the PixArt vendor id 093A (522C = 2.4 GHz dongle, 622C = USB cable),
//!    vendor collection FF05:0001. Read-only status query: SET_FEATURE report 09
//!    [09][89][00 x7], then GET_FEATURE report 09 until [09][89][battery][dpi/rate]...; battery
//!    bit 7 = charging, low 7 bits = percent. The same layout is pushed as input report 09, but
//!    only now and then (when the mouse idles or a setting changes), too rarely for a one-shot
//!    poll. A reply with bytes 2 and 3 both 0 is stale and skipped. On the cable the first FF05
//!    collection rejects SET_FEATURE, so the collections are tried last to first.
//!    From github.com/OmarK6/Incott-Manager (device.go), github.com/HeHaoren/incott-mouse-app
//!    (docs/protocol.md) and github.com/FelixNg21/MouseBattery (battery byte layout, verified on a
//!    G23 V2 with the 522C dongle).
//!  * Delux M800 Pro (VID 248A, receiver 5B2F, cable 5B2E): 33-byte feature report 0x0C on usage
//!    page FF00 / usage 01. A SET_FEATURE status query [0C][01][20][00][seq...] is answered via
//!    GET_FEATURE 0x0C: bytes [8..11] ASCII model ("M802"), [15] sensor, [18] percent, [19] state
//!    (0 = discharging, 1 = charging, 2 = full). The dongle requires incrementing sequence numbers
//!    in byte 4.
//!  * Wraith W1 (Standard / Freestyle) on the same PixArt ids 093A:522C / 622C and collection FF05,
//!    but its firmware uses a different command map: on the W1, 89 reads profile settings, not the
//!    status. All commands are 8-byte feature reports with report id 09. Model check first:
//!    SET_FEATURE [09][8F] (read device info), then GET_FEATURE 09 until it echoes 8F; byte 3 is
//!    the model, 18 = W1 Standard, 20 = W1 Freestyle. The Incott models use other codes
//!    (1, 2, 3, 6, 8, 9, 14), so a W1 is never read with the Incott query and vice versa. Status:
//!    86 is a per-button read (SET_FEATURE [09][86][button], the feature reply holds that button's
//!    mapping). The mouse pushes its status input report 09 [09][battery][rate | slot << 4]... in
//!    answer to these reads. Each read is done like the web driver's query helper _i():
//!    SET_FEATURE, wait 150 ms (8 ms for other commands), GET_FEATURE 09, and once more 20 ms later
//!    if the reply is still empty; firing the 86s back to back without reading the replies got no
//!    push on the reporter's mouse, not even on the cable. After 8F the sweep over buttons
//!    0, 1, 2, 4, 3 (its Ri()) runs once, then the web driver's 700 ms keep-alive Bi() (one 86 for
//!    button 0, read back) repeats while the status report is awaited. Battery bit 7 = charging,
//!    low 7 bits = percent. From the Wraith web driver at https://www.w1.software/
//!    (assets/index-*.js: READ_INIT 0x8F, READ_STATUS 0x86, _i() timing, Ri() sweep, Bi() on a
//!    700 ms interval, status input report 09 parsed by its Qr()) and the W1 Service v0.1.7 binary
//!    (8F, 200 ms, 86 sweep, then report-09 reads on the first FF05 collection).

use std::collections::{BTreeMap, BTreeSet};
use std::sync::Mutex;

use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{clamp100, hex4, hid_product, HidIo, PollContext};
use crate::win::{now_ms, sleep_ms};

fn read_until(d: &mut dyn HidIo, r: &mut Vec<u8>, timeout_ms: u32, mut matched: impl FnMut(&[u8]) -> bool) -> bool {
    let end = now_ms() + timeout_ms as u64;
    while (end as i64 - now_ms() as i64) > 0 {
        let left = (end as i64 - now_ms() as i64) as u32;
        if d.read(r, left) < 0 { return false; }
        if matched(r) { return true; }
    }
    false
}

fn poll_motospeed(ctx: &mut PollContext) {
    for pid in [0xFFE0u16, 0xFFF2, 0xFFF1] {
        if ctx.is_claimed(0x0BDA, pid) { continue; }
        for c in ctx.find(0x0BDA, pid, |c| c.iface == 4 && c.out_len() >= 21) {
            let mut s = DeviceStatus {
                key: format!("motospeed:{}", hex4(pid)),
                name: "Motospeed X6".into(),
                kind: DeviceKind::Mouse,
                ..Default::default()
            };
            if pid == 0xFFF1 {
                // plugged in: charging, no battery reading over the cable
                s.via = "USB cable".into();
                s.charging = true;
                ctx.add(s, 0x0BDA, pid);
                break;
            }
            let Some(mut d) = ctx.open(&c) else { continue };
            d.flush();
            if !d.write(&[0xB5, 0x06], 500) { continue; }
            let mut r = Vec::new();
            if !read_until(d.as_mut(), &mut r, 1500, |r| r.len() > 20 && r[0] == 0xB4) { continue; }
            let raw = r[20] as i32;
            s.via = "2.4 GHz receiver".into();
            s.charging = raw >= 128;
            s.percent = clamp100(if s.charging { raw - 128 } else { raw });
            ctx.add(s, 0x0BDA, pid);
            break;
        }
    }
}

// Xenta receiver (1D57:FA60, also FA65; cable FA55 / 2155), used by Delux and Attack Shark mice.
// The receiver broadcasts [03][model][40 or 41][state][level] every ~2 s; nothing is sent to it. The
// handle stays open between polls so these frames queue up. A reading counts once two frames agree,
// because every link-up starts with a false 100% (github.com/qu1ncky/BatteryTray, XentaReceiverProvider).
struct XentaModel { code: u8, name: &'static str, tens: bool }

const XENTA_MODELS: [XentaModel; 6] = [
    XentaModel { code: 0x3D, name: "Delux M900 Pro", tens: false },
    XentaModel { code: 0x55, name: "Attack Shark X11", tens: false },
    XentaModel { code: 0x4E, name: "Attack Shark X3 Max", tens: false },
    XentaModel { code: 0xE5, name: "Attack Shark V3 Pro", tens: false },
    XentaModel { code: 0x24, name: "Attack Shark V6", tens: false },
    XentaModel { code: 0x10, name: "Attack Shark X6 / R1", tens: true },  // level reported in tens (0-10)
];

/// The C++ XentaListener keeps its open `HidDev` in a global map. `Box<dyn HidIo>` wraps a Win32
/// HANDLE and is therefore not `Send`, so the map entry wraps it in a newtype marked `Send`:
/// polls run on a single thread, so the handle is never actually moved across threads.
struct SendHidIo(Box<dyn HidIo>);
unsafe impl Send for SendHidIo {}

struct XentaListener {
    dev: SendHidIo,
    last: Vec<u8>,
    prev: Vec<u8>,  // the two most recent battery frames
    last_frame_at: u64,
}
static G_XENTA: Mutex<BTreeMap<String, XentaListener>> = Mutex::new(BTreeMap::new());  // by collection path

fn poll_xenta(ctx: &mut PollContext) {
    let pids = [0xFA60u16, 0xFA65, 0xFA55, 0x2155];
    let mut present: BTreeSet<String> = BTreeSet::new();
    for pid in pids {
        if ctx.is_claimed(0x1D57, pid) { continue; }
        for c in ctx.find(0x1D57, pid, |c| c.page() == 0x000A && c.in_len() >= 5) {
            present.insert(c.path.clone());
            let mut g = G_XENTA.lock().unwrap();
            let fresh = !g.contains_key(&c.path);
            if fresh {
                let Some(dev) = ctx.open_read_only(&c) else { continue };
                g.insert(c.path.clone(), XentaListener {
                    dev: SendHidIo(dev), last: Vec::new(), prev: Vec::new(), last_frame_at: 0,
                });
            }
            let Some(l) = g.get_mut(&c.path) else { continue };
            // Take everything queued since the last poll; a new listener waits for two frames.
            let until = now_ms() + if fresh { 5000 } else { 0 };
            let mut r = Vec::new();
            let mut got = 0;
            loop {
                let wait = if fresh && got < 2 { 1.max(until as i64 - now_ms() as i64) as u32 } else { 30 };
                if fresh && got < 2 && (until as i64 - now_ms() as i64) <= 0 { break; }
                if l.dev.0.read(&mut r, wait) < 5 { break; }
                if r[0] != 0x03 || (r[2] != 0x40 && r[2] != 0x41) { continue; }
                l.prev = l.last.clone();
                l.last = r[..5].to_vec();
                l.last_frame_at = now_ms();
                got += 1;
            }
            if l.last.is_empty() || now_ms() - l.last_frame_at > 15000 { continue; }  // silent receiver: try the next one
            let cable = pid == 0xFA55 || pid == 0x2155;
            let code = l.last[1];
            let st = l.last[3];
            let level = l.last[4];
            let model = XENTA_MODELS.iter().find(|m| m.code == code);
            let mut s = DeviceStatus {
                key: format!("xenta:{}", hex4(pid)),
                kind: DeviceKind::Mouse,
                ..Default::default()
            };
            s.name = model.map(|m| m.name).unwrap_or("Wireless mouse").into();
            s.via = if cable { "USB cable" } else { "2.4 GHz receiver" }.into();
            let agreed = l.prev == l.last;
            if cable || st == 0x02 || st == 0x03 {
                s.charging = true;  // the level is frozen on external power
                if st == 0x02 && !cable { s.percent = 100; }
            } else if agreed {
                match model {
                    Some(m) if m.tens => {
                        if level >= 1 && level <= 10 { s.percent = level as i32 * 10; }
                    }
                    _ => {
                        if st == 0x01 && level >= 1 && level <= 100 { s.percent = level as i32; }
                    }
                }
            }
            if s.percent < 0 && !s.charging { s.asleep = true; }  // shown with the last known value
            ctx.add(s, 0x1D57, pid);
            break;
        }
    }
    // forget receivers that were unplugged
    G_XENTA.lock().unwrap().retain(|path, _| present.contains(path));
}

fn poll_ajazz(ctx: &mut PollContext) {
    for vendor in [0x249Au16, 0x248A] {
        for &(vid, pid) in &ctx.products(vendor) {
            for c in ctx.find(vid, pid, |c| c.iface == 2 && c.out_len() == 33 && c.in_len() == 33) {
                let Some(mut d) = ctx.open(&c) else { continue };
                d.flush();
                if !d.write(&[0x00, 0x10], 500) { continue; }  // report id 0, command 10, zero payload (checksum 0)
                let mut r = Vec::new();
                let ok = read_until(d.as_mut(), &mut r, 1500, |r| {
                    if r.len() < 32 || r[0] != 0x10 || r[1] != 0x00 { return false; }
                    let sum: u32 = r[4..=30].iter().map(|&b| b as u32).sum();
                    (sum as u8) == r[31]
                });
                if !ok || r[13] > 100 { continue; }
                let mut s = DeviceStatus {
                    key: format!("ajazz:{}:{}", hex4(vid), hex4(pid)),
                    kind: DeviceKind::Mouse,
                    ..Default::default()
                };
                let mut model = String::new();
                let mut i = 4;
                while i < 8 && r[i] >= 0x20 && r[i] < 0x7F {
                    model.push(r[i] as char);
                    i += 1;
                }
                s.name = if model.len() == 4 && model.starts_with('M') {
                    format!("Ajazz AJ{}", &model[1..])
                } else {
                    "Ajazz mouse".into()
                };
                let receiver = vid == 0x249A;
                s.via = if receiver { "2.4 GHz receiver" } else { "USB cable" }.into();
                s.connected = !receiver || r[14] != 0;
                s.charging = r[12] != 0;
                if s.connected { s.percent = r[13] as i32; }
                ctx.add(s, vid, pid);
                break;
            }
        }
    }
}

fn poll_ajazz_aj_series(ctx: &mut PollContext) {
    for &(vid, pid) in &ctx.products(0x3151) {
        for c in ctx.find(vid, pid, |c| c.page() == 0xFFFF && c.usage() == 0x02 && c.feat_len() >= 65) {
            let Some(mut d) = ctx.open_feature_only(&c) else { continue };
            let mut req = vec![0u8; c.feat_len() as usize];
            req[0] = 0x00;  // unnumbered report
            req[1] = 0xF7;  // status poll: brings the 2.4 GHz telemetry link up
            if !d.set_feature(&req) { continue; }
            sleep_ms(30);
            let mut r = Vec::new();
            if !d.get_feature(0x05, &mut r) || r.len() < 4 { continue; }
            if r[0] != 0x05 || r[1] != 0 || r[2] != 0 { continue; }  // malformed / reconnect frame
            let pct = r[3] as i32;
            if pct > 100 { continue; }
            let mut s = DeviceStatus {
                key: format!("ajazzaj:{}:{}", hex4(vid), hex4(pid)),
                kind: DeviceKind::Mouse,
                ..Default::default()
            };
            s.name = hid_product(&c);
            if s.name.is_empty() { s.name = "AJAZZ mouse".into(); }
            s.via = "2.4 GHz receiver".into();
            s.connected = pct > 0;  // 0 means the link is up but the mouse is off
            if s.connected { s.percent = pct; }
            ctx.add(s, vid, pid);
            break;
        }
    }
}

// Unrelated AA FA / AA ED reports are skipped.
fn is_battery(r: &[u8]) -> bool { r.len() > 9 && r[0] == 0xAA && r[1] == 0x30 }

fn poll_ajazz_aj139(ctx: &mut PollContext) {
    for vendor in [0xA8A5u16, 0xA8A4] {
        let pid = 0x2255u16;
        if ctx.is_claimed(vendor, pid) { continue; }
        for c in ctx.find(vendor, pid, |c| c.page() == 0xFF01 && c.usage() == 0x0010 && c.out_len() >= 65 && c.in_len() >= 65) {
            let Some(mut d) = ctx.open(&c) else { continue };
            let mut r = Vec::new();
            d.flush();
            // The two sources disagree on request byte 3: both variants are tried.
            let mut ok = d.write(&[0x00, 0x55, 0x30, 0xA5, 0x2E, 0x2E], 500)
                && read_until(d.as_mut(), &mut r, 700, is_battery);
            if !ok {
                ok = d.write(&[0x00, 0x55, 0x30, 0xA5, 0x0B, 0x2E, 0x01, 0x01], 500)
                    && read_until(d.as_mut(), &mut r, 800, is_battery);
            }
            if !ok || r[8] > 100 { continue; }
            let cable = vendor == 0xA8A4;
            let mut s = DeviceStatus {
                key: format!("ajazz139:{}:{}", hex4(vendor), hex4(pid)),
                name: "AJAZZ wireless mouse".into(),
                kind: DeviceKind::Mouse,
                ..Default::default()
            };
            s.via = if cable { "USB cable" } else { "2.4 GHz receiver" }.into();
            s.charging = r[9] != 0;
            s.connected = cable || r[8] > 0;  // 0 from the dongle: the mouse is off or out of range
            if s.connected { s.percent = r[8] as i32; }
            ctx.add(s, vendor, pid);
            break;
        }
    }
}

// Wraith W1: see the header. Once a dongle has answered as a W1, it stays one for the rest of the
// run, so a W1 that is asleep (no device-info reply) is not handed to the Incott driver.
// 522C, 622C: last W1 model code seen (0 = not a W1 yet).
static KNOWN_MODEL: Mutex<[i32; 2]> = Mutex::new([0, 0]);

// One 86 (per-button read) the way the web driver's _i() does it: SET_FEATURE, 150 ms, GET_FEATURE,
// and a second GET 20 ms later if the reply is still empty. Input reports that arrive meanwhile
// stay queued by Windows and are read afterwards.
fn read_button(d: &mut dyn HidIo, button: u8) -> bool {
    if !d.set_feature(&[0x09, 0x86, button]) { return false; }
    let mut f = Vec::new();
    for t in 0..2 {
        sleep_ms(if t == 0 { 150 } else { 20 });
        if !d.get_feature(0x09, &mut f) { return true; }
        if f.len() >= 4 && f[1] == 0x86 { break; }
    }
    true
}

fn listen(ins: &mut [Box<dyn HidIo>], got: &mut bool, r: &mut Vec<u8>, ms: u32) {
    let end = now_ms() + ms as u64;
    while !*got && (end as i64 - now_ms() as i64) > 0 {
        for input in ins.iter_mut() {
            if input.read(r, 50) >= 2 && r[0] == 0x09 && (r[1] & 0x7F) <= 100 {
                *got = true;
                break;
            }
        }
    }
}

fn poll_wraith_w1(ctx: &mut PollContext) {
    for pid in [0x522Cu16, 0x622C] {
        if ctx.is_claimed(0x093A, pid) { continue; }
        let idx = usize::from(pid == 0x622C);
        let mut colls = ctx.find(0x093A, pid, |c| c.page() == 0xFF05 && c.feat_len() >= 9);
        if colls.is_empty() { continue; }
        colls.reverse();  // on the cable the first FF05 collection rejects SET_FEATURE
        let mut d: Option<Box<dyn HidIo>> = None;
        let mut replied = 0i32;  // model code from the device-info read, -1 = answered but not a W1
        for c in &colls {
            d = ctx.open_feature_only(c);
            let Some(dev) = d.as_deref_mut() else { continue };
            if !dev.set_feature(&[0x09, 0x8F]) {
                d = None;  // Close()
                continue;
            }
            let mut r = Vec::new();
            let mut i = 0;
            while i < 10 && replied == 0 {
                sleep_ms(50);
                if !dev.get_feature(0x09, &mut r) { break; }
                if r.len() >= 4 && r[0] == 0x09 && r[1] == 0x8F {
                    replied = if r[3] == 18 || r[3] == 20 { r[3] as i32 } else { -1 };
                }
                i += 1;
            }
            if replied != 0 { break; }
            d = None;  // Close()
        }
        let model;
        {
            let mut km = KNOWN_MODEL.lock().unwrap();
            if replied < 0 {
                km[idx] = 0;  // another PixArt mouse (Incott): leave it to poll_incott
                continue;
            }
            if replied != 0 { km[idx] = replied; }
            if km[idx] == 0 { continue; }  // no answer and never seen as a W1
            model = km[idx];
        }

        let cable = pid == 0x622C;
        let mut s = DeviceStatus {
            key: format!("wraithw1:{}", hex4(pid)),
            name: if model == 20 { "Wraith W1 Freestyle" } else { "Wraith W1" }.into(),
            kind: DeviceKind::Mouse,
            ..Default::default()
        };
        s.via = if cable { "USB cable" } else { "2.4 GHz receiver" }.into();
        if !cable { s.grace_sec = 1800; }  // keep the last value if a sleeping mouse stops answering
        s.connected = false;

        if let Some(mut dev) = d {
            // Listen on every FF05 collection with an input report: the status push may arrive on any of them.
            let mut ins: Vec<Box<dyn HidIo>> = Vec::new();
            for c in ctx.find(0x093A, pid, |c| c.page() == 0xFF05 && c.in_len() >= 2) {
                let Some(mut input) = ctx.open_read_only(&c) else { continue };
                input.flush();
                ins.push(input);
            }
            let mut r = Vec::new();
            let mut got = false;
            if !ins.is_empty() {
                sleep_ms(200);  // the W1 Service waits 200 ms after 8F before its next request
                // Read-only sweep of 86 over buttons 0, 1, 2, 4, 3 (the web driver's Ri()), then its
                // 700 ms keep-alive Bi() (86 for button 0, read back) while waiting for the status input report.
                let mut sent = false;
                for b in [0u8, 1, 2, 4, 3] {
                    if read_button(&mut dev, b) { sent = true; }
                }
                if sent {
                    listen(&mut ins, &mut got, &mut r, 400);
                    for _beat in 0..4 {
                        if got { break; }
                        if !read_button(&mut dev, 0) { break; }
                        listen(&mut ins, &mut got, &mut r, 550);  // ~700 ms per beat including the 150 ms read
                    }
                }
            }
            if got {
                let pct = (r[1] & 0x7F) as i32;
                s.charging = (r[1] & 0x80) != 0;
                s.connected = cable || pct > 0 || s.charging;  // 0 from the dongle: the mouse is off
                if s.connected { s.percent = pct; }
            }
        }
        ctx.add(s, 0x093A, pid);  // claimed even when asleep, so poll_incott never queries a W1
    }
}

fn poll_incott(ctx: &mut PollContext) {
    for pid in [0x522Cu16, 0x622C] {
        if ctx.is_claimed(0x093A, pid) { continue; }
        let mut colls = ctx.find(0x093A, pid, |c| c.page() == 0xFF05 && c.feat_len() >= 9);
        colls.reverse();  // on the cable the first FF05 collection rejects SET_FEATURE
        for c in &colls {
            let Some(mut d) = ctx.open_feature_only(c) else { continue };
            if !d.set_feature(&[0x09, 0x89]) { continue; }
            let mut r = Vec::new();
            let mut ok = false;
            let mut i = 0;
            while !ok && i < 10 {
                sleep_ms(50);
                if !d.get_feature(0x09, &mut r) { break; }
                ok = r.len() >= 4 && r[0] == 0x09 && r[1] == 0x89 && (r[2] | r[3]) != 0;
                i += 1;
            }
            if !ok { continue; }
            let pct = (r[2] & 0x7F) as i32;
            if pct > 100 { continue; }
            let cable = pid == 0x622C;
            let mut s = DeviceStatus {
                key: format!("incott:{}", hex4(pid)),
                name: "Incott mouse".into(),  // the ids are shared by the G23 V2 and the G24
                kind: DeviceKind::Mouse,
                ..Default::default()
            };
            s.via = if cable { "USB cable" } else { "2.4 GHz receiver" }.into();
            s.charging = (r[2] & 0x80) != 0;
            s.connected = cable || pct > 0;  // 0 from the dongle: the mouse is off or out of range
            if s.connected { s.percent = pct; }
            if !cable { s.grace_sec = 1800; }  // keep the last value if a sleeping mouse stops answering
            ctx.add(s, 0x093A, pid);
            break;
        }
    }
}

// The dongle requires incrementing sequence numbers in byte 4 (a C++ BYTE, so it wraps at 256).
static DELUX_SEQ: Mutex<u8> = Mutex::new(0);

fn next_delux_seq() -> u8 {
    let mut seq = DELUX_SEQ.lock().unwrap();
    *seq = seq.wrapping_add(1);
    *seq
}

fn poll_delux_m800(ctx: &mut PollContext) {
    for pid in [0x5B2Eu16, 0x5B2F] {
        if ctx.is_claimed(0x248A, pid) { continue; }
        for c in ctx.find(0x248A, pid, |c| c.page() == 0xFF00 && c.usage() == 0x0001 && c.feat_len() >= 33) {
            let Some(mut d) = ctx.open_feature_only(&c) else { continue };
            let receiver = pid == 0x5B2F;
            let mut req = vec![0u8; c.feat_len() as usize];
            req[0] = 0x0C;
            req[1] = 0x01;
            req[2] = 0x20;
            req[4] = next_delux_seq();
            if !d.set_feature(&req) { continue; }
            sleep_ms(20);
            let mut r = Vec::new();
            if !d.get_feature(0x0C, &mut r) || r.len() < 20 { continue; }
            if r[0] != 0x0C || r[2] != 0x20 { continue; }

            if receiver && r[6] == 0 {
                req[4] = next_delux_seq();
                if d.set_feature(&req) {
                    sleep_ms(20);
                    let mut r2 = Vec::new();
                    if d.get_feature(0x0C, &mut r2) && r2.len() >= 20 && r2[0] == 0x0C && r2[2] == 0x20 {
                        r = r2;
                    }
                }
            }

            let pct = r[18] as i32;
            if pct > 100 { continue; }
            let st = r[19];
            let mut s = DeviceStatus {
                key: "delux:m800".into(),
                name: "Delux M800 Pro".into(),
                kind: DeviceKind::Mouse,
                ..Default::default()
            };
            s.via = if receiver { "2.4 GHz receiver" } else { "USB cable" }.into();
            s.connected = r[6] != 0 || pct > 0;
            if st == 2 {
                s.percent = 100;
                s.charging = true;
            } else if st == 1 {
                s.charging = true;
                if s.connected && pct > 0 { s.percent = clamp100(pct); }
            } else if s.connected && pct > 0 {
                s.percent = clamp100(pct);
            }
            if !receiver && s.connected {
                ctx.claim(0x248A, 0x5B2F);
            }
            ctx.add(s, 0x248A, pid);
            break;
        }
    }
}

pub fn poll_misc_mice(ctx: &mut PollContext) {
    poll_motospeed(ctx);
    poll_xenta(ctx);
    poll_delux_m800(ctx);
    poll_ajazz(ctx);
    poll_ajazz_aj_series(ctx);
    poll_ajazz_aj139(ctx);
    poll_wraith_w1(ctx);  // before poll_incott: same ids, different commands
    poll_incott(ctx);
}
