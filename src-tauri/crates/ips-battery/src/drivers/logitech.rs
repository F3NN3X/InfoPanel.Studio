//! Logitech HID++ (VID 046D): Unifying / Bolt / Lightspeed / Nano receivers, wired or Bluetooth
//! devices, and G headsets. Features are discovered through the root feature, so devices are
//! supported without a per-model table.
//!
//! Message: [report][device index][feature index][function << 4 | sw id][params...]
//!   report 0x10 = short (7 bytes), 0x11 = long (20 bytes)
//!   HID++ 2.0 error: [.., 0xFF, feature, fn|sw, code]   HID++ 1.0 error: [.., 0x8F, sub id, address, code]
//! Battery features: 0x1004 unified battery, 0x1000 battery level, 0x1001 battery voltage,
//!   0x1F20 ADC measurement (headsets). HID++ 1.0 devices: registers 0x0D and 0x07.
//! References: Logitech HID++ 2.0 specification drafts, github.com/pwr-Solaar/Solaar,
//! github.com/Sapd/HeadsetControl (headset voltage calibration).

use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{HidColl, HidIo, PollContext, guess_kind, hex4, hid_product, interpolate};
use crate::win::now_ms;

/// Our software id; replies to other apps (G HUB, Options+) carry theirs.
const K_SW_ID: u8 = 0x0D;

/// LIGHTSPEED dongles that speak only HID++ 2.0 and relay a single paired device: the dongle itself
/// answers the ping on index 0xFF (it has no battery feature) and the mouse is on index 1.
/// 046D:C54F = PRO X3 SUPERSTRIKE dongle (Solaar PR #3352, "PASSTHROUGH_DONGLE_IDS").
fn is_passthrough_dongle(pid: u16) -> bool {
    pid == 0xC54F
}

/// One physical device's short-report (0x10, 7 bytes) and long-report (0x11, 20 bytes) HID++
/// collections, both opened for read/write.
struct Hidpp {
    s: Option<Box<dyn HidIo>>,
    l: Option<Box<dyn HidIo>>,
}

impl Hidpp {
    fn open(ctx: &mut PollContext, short_c: Option<&HidColl>, long_c: Option<&HidColl>) -> Option<Hidpp> {
        let s = short_c.and_then(|c| ctx.open(c));
        let l = long_c.and_then(|c| ctx.open(c));
        if s.is_none() && l.is_none() {
            return None;
        }
        Some(Hidpp { s, l })
    }

    /// Sends a request and waits for its reply. Returns 1 = reply (params in `p`), 0 = error reply
    /// (code in `err`), -1 = no answer.
    fn request(
        &mut self,
        idx: u8,
        b2: u8,
        b3: u8,
        params: &[u8],
        p: &mut Vec<u8>,
        err: &mut u8,
        force_short: bool,
        timeout_ms: u32,
    ) -> i32 {
        let use_long = self.l.is_some() && !force_short;
        if !use_long && self.s.is_none() {
            return -1;
        }
        let mut msg = vec![0u8; if use_long { 20 } else { 7 }];
        msg[0] = if use_long { 0x11 } else { 0x10 };
        msg[1] = idx;
        msg[2] = b2;
        msg[3] = b3;
        let mut i = 4;
        for &v in params {
            if i >= msg.len() {
                break;
            }
            msg[i] = v;
            i += 1;
        }
        let sent = if use_long {
            self.l.as_mut().map_or(false, |d| d.write(&msg, 500))
        } else {
            self.s.as_mut().map_or(false, |d| d.write(&msg, 500))
        };
        if !sent {
            return -1;
        }

        let end = now_ms() + timeout_ms as u64;
        let mut r: Vec<u8> = Vec::new();
        while (end as i64 - now_ms() as i64) > 0 {
            for d in [&mut self.l, &mut self.s].into_iter().flatten() {
                if d.read(&mut r, 15) < 7 {
                    continue;
                }
                if (r[0] != 0x10 && r[0] != 0x11) || r[1] != idx {
                    continue;
                }
                if r[2] == b2 && r[3] == b3 {
                    p.clear();
                    p.extend_from_slice(&r[4..]);
                    return 1;
                }
                if (r[2] == 0xFF || r[2] == 0x8F) && r[3] == b2 && r[4] == b3 {
                    *err = r[5];
                    return 0;
                }
            }
        }
        -1
    }

    /// HID++ 2.0 call: feature index + function number.
    fn call(&mut self, idx: u8, feature: u8, func: u8, params: &[u8], p: &mut Vec<u8>) -> bool {
        let mut err: u8 = 0;
        self.request(idx, feature, (func << 4) | K_SW_ID, params, p, &mut err, false, 500) == 1
    }

    fn feature_index(&mut self, idx: u8, feature_id: u16) -> u8 {
        let mut p: Vec<u8> = Vec::new();
        if self.call(idx, 0x00, 0, &[(feature_id >> 8) as u8, feature_id as u8], &mut p) && !p.is_empty() {
            return p[0];
        }
        0
    }
}

/// Voltage -> % for a typical Li-ion cell (mice/keyboards).
fn li_ion_percent(mv: i32) -> i32 {
    const V: [i32; 13] = [4186, 4067, 3989, 3922, 3859, 3811, 3778, 3751, 3717, 3671, 3646, 3579, 3500];
    const P: [i32; 13] = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 5, 2, 0];
    interpolate(mv, &V, &P)
}

/// Voltage -> % for G headsets (calibration from HeadsetControl).
fn headset_percent(pid: u16, mv: i32) -> i32 {
    const G533V: [i32; 6] = [4200, 3850, 3790, 3750, 3680, 3330];
    const G533P: [i32; 6] = [100, 50, 30, 20, 5, 0];
    const G535V: [i32; 6] = [4175, 3817, 3766, 3730, 3664, 3310];
    const G535P: [i32; 6] = [100, 50, 30, 20, 5, 0];
    const G633V: [i32; 8] = [4100, 3950, 3850, 3750, 3650, 3500, 3300, 3150];
    const G633P: [i32; 8] = [100, 80, 60, 40, 20, 10, 5, 0];
    const GPROV: [i32; 6] = [4150, 3830, 3780, 3740, 3670, 3320];
    const GPROP: [i32; 6] = [100, 50, 30, 20, 5, 0];
    const DEFV: [i32; 6] = [4100, 3850, 3780, 3730, 3650, 3300];
    const DEFP: [i32; 6] = [100, 50, 30, 20, 5, 0];
    match pid {
        0x0A66 => interpolate(mv, &G533V, &G533P),
        0x0AC4 => interpolate(mv, &G535V, &G535P),
        0x0A5C | 0x0A89 | 0x0A5B | 0x0A87 | 0x0AB5 | 0x0AFE => interpolate(mv, &G633V, &G633P),
        0x0AA7 | 0x0AAA | 0x0ABA | 0x0AFB => interpolate(mv, &GPROV, &GPROP),
        _ => interpolate(mv, &DEFV, &DEFP),
    }
}

fn kind_from_type(t: u8) -> DeviceKind {
    match t {
        0x00 | 0x02 => DeviceKind::Keyboard,
        0x03 | 0x04 | 0x05 => DeviceKind::Mouse,
        0x08 => DeviceKind::Headset,
        0x0B | 0x0C => DeviceKind::Gamepad,
        _ => DeviceKind::Other,
    }
}

/// Fills battery fields from whichever battery feature the device has. Returns false if none.
fn read_battery_20(h: &mut Hidpp, idx: u8, pid: u16, s: &mut DeviceStatus) -> bool {
    let mut p: Vec<u8> = Vec::new();
    let f = h.feature_index(idx, 0x1004); // UNIFIED_BATTERY
    if f != 0 {
        if h.call(idx, f, 1, &[], &mut p) && p.len() >= 3 {
            // get_status (fn 1)
            let soc = p[0] as i32;
            let level = p[1];
            let st = p[2] as i32;
            if soc > 0 && soc <= 100 {
                s.percent = soc;
            } else if level != 0 {
                s.percent = if level & 8 != 0 {
                    100
                } else if level & 4 != 0 {
                    60
                } else if level & 2 != 0 {
                    20
                } else {
                    5
                };
                let level_text = if level & 8 != 0 {
                    "Full"
                } else if level & 4 != 0 {
                    "Good"
                } else if level & 2 != 0 {
                    "Low"
                } else {
                    "Critical"
                };
                s.level_text = level_text.into();
            }
            s.charging = st == 1 || st == 2 || st == 3;
            return true;
        }
    }
    let f = h.feature_index(idx, 0x1000); // BATTERY_STATUS
    if f != 0 {
        if h.call(idx, f, 0, &[], &mut p) && p.len() >= 3 {
            // GetBatteryLevelStatus (fn 0)
            let st = p[2] as i32;
            s.charging = st >= 1 && st <= 4;
            s.percent = if p[0] <= 100 { p[0] as i32 } else { -1 };
            if s.percent == 0 && st == 3 {
                s.percent = 100;
            }
            return true;
        }
    }
    let f = h.feature_index(idx, 0x1001); // BATTERY_VOLTAGE
    if f != 0 {
        if h.call(idx, f, 0, &[], &mut p) && p.len() >= 3 {
            // GetBatteryInfo (fn 0)
            s.millivolts = ((p[0] as i32) << 8) | p[1] as i32;
            s.charging = (p[2] & 0x80) != 0;
            if s.millivolts != 0 {
                s.percent = li_ion_percent(s.millivolts);
            }
            return true;
        }
    }
    let f = h.feature_index(idx, 0x1F20); // ADC_MEASUREMENT (headsets)
    if f != 0 {
        if h.call(idx, f, 0, &[], &mut p) && p.len() >= 3 {
            s.millivolts = ((p[0] as i32) << 8) | p[1] as i32;
            s.charging = p[2] == 0x03;
            if s.millivolts != 0 {
                s.percent = headset_percent(pid, s.millivolts);
            }
            return true;
        }
    }
    false
}

fn read_name_and_type_20(h: &mut Hidpp, idx: u8, s: &mut DeviceStatus) {
    let f = h.feature_index(idx, 0x0005); // DEVICE_NAME
    if f == 0 {
        return;
    }
    let mut p: Vec<u8> = Vec::new();
    if h.call(idx, f, 0, &[], &mut p) && !p.is_empty() {
        let len = p[0] as i32;
        let mut name: Vec<u8> = Vec::new();
        while (name.len() as i32) < len {
            if !h.call(idx, f, 1, &[name.len() as u8], &mut p) || p.is_empty() {
                break;
            }
            let before = name.len();
            for &ch in &p {
                if name.len() as i32 >= len || ch == 0 {
                    break;
                }
                name.push(ch);
            }
            if name.len() == before {
                break;
            }
        }
        if !name.is_empty() {
            // The device reports the name as raw bytes; widen each byte the way the C++ did
            // (`std::wstring w(name.begin(), name.end())`): `char` is signed on MSVC, so bytes
            // >= 0x80 are sign-extended into U+FF80..=U+FFFF rather than zero-extended.
            let w: String = name.iter().map(|&b| if b < 0x80 { b as char } else { char::from_u32(0xFF00 | b as u32).unwrap() }).collect();
            s.name = if w.starts_with("Logitech") || w.starts_with("G ") || w.starts_with("MX") { w } else { format!("Logitech {w}") };
        }
    }
    if h.call(idx, f, 2, &[], &mut p) && !p.is_empty() {
        s.kind = kind_from_type(p[0]);
    }
}

/// DEVICE_INFORMATION (0x0003) getDeviceInfo: [entity count][unit id x4][transport x2][model id x6]...
/// The unit id identifies the physical device, so a mouse keeps one entry whether it is reached
/// through its receiver or directly over its charging cable (where it shows up under another
/// product id and device index). Returns an empty string if the device does not report one.
fn read_unit_id_20(h: &mut Hidpp, idx: u8) -> String {
    let f = h.feature_index(idx, 0x0003);
    if f == 0 {
        return String::new();
    }
    let mut p: Vec<u8> = Vec::new();
    if !h.call(idx, f, 0, &[], &mut p) || p.len() < 5 {
        return String::new();
    }
    if p[1] == 0 && p[2] == 0 && p[3] == 0 && p[4] == 0 {
        return String::new();
    }
    format!("{}{}", hex4((((p[1] as i32) << 8) | p[2] as i32) as u16), hex4((((p[3] as i32) << 8) | p[4] as i32) as u16))
}

/// HID++ 1.0 devices: register 0x0D (battery %) or 0x07 (battery level 1..7).
fn read_battery_10(h: &mut Hidpp, idx: u8, s: &mut DeviceStatus) -> bool {
    let mut p: Vec<u8> = Vec::new();
    let mut err: u8 = 0;
    if h.request(idx, 0x81, 0x0D, &[], &mut p, &mut err, true, 500) == 1 && p.len() >= 3 && p[0] != 0 && p[0] <= 100 {
        s.percent = p[0] as i32;
        s.charging = p[2] >= 0x21 && p[2] <= 0x26;
        return true;
    }
    if h.request(idx, 0x81, 0x07, &[], &mut p, &mut err, true, 500) == 1 && p.len() >= 2 && p[0] != 0 {
        const PCT: [i32; 8] = [0, 5, 10, 20, 35, 50, 75, 100];
        let lvl = if p[0] > 7 { 7 } else { p[0] };
        s.percent = PCT[lvl as usize];
        let level_text = if p[0] >= 7 {
            "Full"
        } else if p[0] >= 5 {
            "Good"
        } else if p[0] >= 3 {
            "Low"
        } else {
            "Critical"
        };
        s.level_text = level_text.into();
        s.charging = p[1] >= 0x21 && p[1] <= 0x26;
        return true;
    }
    false
}

/// Identifies the physical device a HID collection belongs to, so two receivers with the same
/// product id (e.g. two LIGHTSPEED C547 dongles) are polled separately. A collection path looks like
///   \\?\hid#vid_046d&pid_c547&mi_02&col01#8&2a2b3c4d&0&0000#{guid}
/// and the collections of one interface differ only in "&colNN" and the last "&NNNN" of the
/// instance part. Returns an empty string for a path of another shape (all such paths then share
/// one group, which is how they were polled before).
fn physical_key(c: &HidColl) -> String {
    let p = c.path.to_lowercase();
    let a = p.find('#');
    let b = a.and_then(|a| p[a + 1..].find('#').map(|i| a + 1 + i));
    let e = b.and_then(|b| p[b + 1..].find('#').map(|i| b + 1 + i));
    let (a, b, e) = match (a, b, e) {
        (Some(a), Some(b), Some(e)) => (a, b, e),
        _ => return String::new(),
    };
    let mut hw = p[a + 1..b].to_string();
    let mut inst = p[b + 1..e].to_string();
    if let Some(col) = hw.find("&col") {
        // Drop "&colNN" (6 characters), exactly like the C++ hw.erase(col, 6).
        let cut: String = hw[col..].chars().take(6).collect();
        hw.replace_range(col..col + cut.len(), "");
    }
    if let Some(amp) = inst.rfind('&') {
        inst.truncate(amp);
    }
    format!("{hw}#{inst}")
}

/// Polls one physical device (receiver, cable or Bluetooth link) given its HID++ collections.
/// `suffix` keeps the fallback keys of identical receivers apart. Returns true if it reported a device.
fn poll_logitech_device(ctx: &mut PollContext, pid: u16, shorts: &[HidColl], longs: &[HidColl], suffix: &str) -> bool {
    if shorts.is_empty() && longs.is_empty() {
        return false;
    }
    let Some(mut h) = Hidpp::open(ctx, shorts.first(), longs.first()) else {
        return false;
    };

    let base = if longs.is_empty() { &shorts[0] } else { &longs[0] };
    let product = hid_product(base);
    let is_receiver = product.contains("Receiver") || product.contains("USB Receiver");

    // A device answering a HID++ 2.0 ping at index 0xFF is connected directly (USB cable,
    // Bluetooth, or a receiver-less headset); otherwise it is a receiver with paired devices.
    let mut p: Vec<u8> = Vec::new();
    let mut err: u8 = 0;
    // A Bluetooth HID path (HOGP service 1812, classic HID 1124) is always a direct link. A sleepy
    // Bluetooth mouse can miss the 400 ms ping; probing it as a receiver then answers on every
    // index and lists the same mouse six times.
    let path = base.path.to_lowercase();
    let bluetooth = path.contains("{00001812-") || path.contains("{00001124-");
    let indices: Vec<u8> = if is_passthrough_dongle(pid) {
        vec![1]
    } else if bluetooth
        || (!is_receiver
            && h.request(0xFF, 0x00, 0x10 | K_SW_ID, &[0, 0, 0x5A], &mut p, &mut err, false, 400) == 1
            && p.len() >= 3
            && p[0] >= 2)
    {
        vec![0xFF]
    } else {
        vec![1, 2, 3, 4, 5, 6]
    };

    let mut any = false;
    for idx in indices {
        let mut s = DeviceStatus::default();
        s.key = format!("logi:{}{}:{}", hex4(pid), suffix, idx);
        s.name = if idx == 0xFF && !product.is_empty() { product.clone() } else { "Logitech wireless device".into() };
        s.via = if idx == 0xFF { "USB / Bluetooth".into() } else { "Logitech receiver".into() };
        s.grace_sec = if idx == 0xFF { 0 } else { 1800 }; // receiver devices drop off the link while sleeping
        s.kind = guess_kind(&s.name);

        let r = h.request(idx, 0x00, 0x10 | K_SW_ID, &[0, 0, 0x5A], &mut p, &mut err, false, 400);
        let mut found = false;
        if r == 1 && p.len() >= 3 && p[0] >= 2 {
            read_name_and_type_20(&mut h, idx, &mut s);
            found = read_battery_20(&mut h, idx, pid, &mut s);
            let unit = if found { read_unit_id_20(&mut h, idx) } else { String::new() };
            if !unit.is_empty() {
                s.key = format!("logi:unit:{unit}");
                // Unplugging the cable hands a receiver device back to its receiver; keep the
                // entry for a minute so it does not blink out while the link comes back.
                if idx == 0xFF {
                    s.grace_sec = 60;
                }
            }
            if found && s.kind == DeviceKind::Other && !longs.is_empty() && longs[0].page() == 0xFF43 {
                s.kind = DeviceKind::Headset;
            }
        } else if r == 0 && err == 0x01 {
            // "invalid sub id": a HID++ 1.0 device
            found = read_battery_10(&mut h, idx, &mut s);
        }
        if found {
            if s.kind == DeviceKind::Other {
                s.kind = guess_kind(&s.name);
            }
            ctx.out.push(s);
            any = true;
        }
    }
    any
}

pub fn poll_logitech(ctx: &mut PollContext) {
    let products = ctx.products(0x046D);
    for &(vid, pid) in &products {
        let all_shorts = ctx.find(vid, pid, |c| c.page() == 0xFF00 && c.usage() == 0x0001 && c.out_len() == 7);
        let all_longs = ctx.find(vid, pid, |c| {
            ((c.page() == 0xFF00 && c.usage() == 0x0002) || (c.page() == 0xFF43 && c.usage() == 0x0202)) && c.out_len() == 20
        });

        // One group per physical device: its short and long HID++ collections.
        let mut groups: Vec<String> = Vec::new();
        for list in [&all_shorts, &all_longs] {
            for c in list {
                let k = physical_key(c);
                if !groups.contains(&k) {
                    groups.push(k);
                }
            }
        }

        let mut any = false;
        for (g, group) in groups.iter().enumerate() {
            let shorts: Vec<HidColl> = all_shorts.iter().filter(|c| &physical_key(c) == group).cloned().collect();
            let longs: Vec<HidColl> = all_longs.iter().filter(|c| &physical_key(c) == group).cloned().collect();
            // Keys of the first device stay as they were; a second identical receiver gets "#2", ...
            let suffix = if g != 0 { format!("#{}", g + 1) } else { String::new() };
            if poll_logitech_device(ctx, pid, &shorts, &longs, &suffix) {
                any = true;
            }
        }
        if any {
            ctx.claim(vid, pid);
        }
    }
}
