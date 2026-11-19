//! One battery-powered device as seen during a single poll (devices.h / devices.cpp).
//! Ported verbatim from the batterymon-proto prototype. Two edges the prototype had into its
//! own UI/settings are replaced here: the `HKCU\...\IgnoreDevices` registry read became the
//! blocklist handed to [`poll_all_devices_blocked`], and the `report.rs` dump support is gone.

use std::collections::BTreeSet;

use crate::hid::{HidColl, HidFactory, PollContext, WinHidFactory, enum_hid};

#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub enum DeviceKind {
    #[default]
    Other,
    Mouse,
    Headset,
    Keyboard,
    Gamepad,
    Phone,
}

/// One battery-powered device, as seen during a single poll.
#[derive(Clone, Debug)]
pub struct DeviceStatus {
    pub key: String,         // stable identity across polls (used for the tray icon id)
    pub name: String,        // human readable name
    pub via: String,         // "2.4 GHz receiver", "Bluetooth", "USB cable", ...
    pub kind: DeviceKind,
    pub percent: i32,        // 0..100, or -1 when unknown right now
    pub detail: String,      // extra breakdown for the tooltip, e.g. "L 80%, R 75%, case 40%"
    pub level_text: String,  // set when the device only reports coarse levels ("Low", "Full"...)
    pub charging: bool,
    pub asleep: bool,        // receiver answered but the device is sleeping (keep last value)
    pub connected: bool,     // false: receiver present, device switched off (hidden)
    pub millivolts: i32,     // battery voltage when reported (0 = unknown)
    pub grace_sec: i32,      // keep showing the last value this long if the device stops answering
}

impl Default for DeviceStatus {
    fn default() -> Self {
        Self {
            key: String::new(),
            name: String::new(),
            via: String::new(),
            kind: DeviceKind::Other,
            percent: -1,
            detail: String::new(),
            level_text: String::new(),
            charging: false,
            asleep: false,
            connected: true,
            millivolts: 0,
            grace_sec: 0,
        }
    }
}

/// FNV-1a over the UTF-16 units of a device key, mapped to a stable positive id. Copied from
/// the prototype's tray code (`stable_id`), which hashed wchar_t units for the tray icon id;
/// the host uses it to build the `<id>` of the `battery.<id>.*` sensor keys.
pub fn stable_id(key: &str) -> u32 {
    let mut h: u32 = 2166136261;
    for c in key.encode_utf16() { // the C++ hashes wchar_t units
        h ^= c as u32;
        h = h.wrapping_mul(16777619);
    }
    (h & 0x7FFFFFFF) | 0x100
}

/// Drops every collection whose VID:PID is on the blocklist (the prototype's IgnoreDevices).
pub fn apply_blocklist(colls: &mut Vec<HidColl>, blocked: &[(u16, u16)]) {
    if blocked.is_empty() { return; }
    let set: BTreeSet<(u16, u16)> = blocked.iter().copied().collect();
    colls.retain(|c| !set.contains(&(c.vid, c.pid)));
}

/// Queries every supported device. Blocking (can take a second or two); call from a worker
/// thread. `blocked` holds "VID:PID" pairs that are never opened.
pub fn poll_all_devices_blocked(blocked: &[(u16, u16)]) -> Vec<DeviceStatus> {
    let mut colls = enum_hid();
    apply_blocklist(&mut colls, blocked);
    let mut io = WinHidFactory;
    poll_with(colls, &mut io)
}

/// Queries every supported device without a blocklist (the prototype's `poll_all_devices`).
pub fn poll_all_devices() -> Vec<DeviceStatus> {
    poll_all_devices_blocked(&[])
}

/// Polls the given (already enumerated and blocklist-filtered) collections through any
/// transport behind the `HidFactory` seam — the entry point the host and the tests drive.
pub fn poll_with(colls: Vec<HidColl>, io: &mut dyn HidFactory) -> Vec<DeviceStatus> {
    let mut ctx = PollContext::new(io);
    ctx.colls = colls;
    poll::run_all(&mut ctx);
    ctx.out
}

pub mod poll {
    //! Runs every driver in order. Vendor drivers go first and claim the devices they handle;
    //! the generic fallbacks then only look at what is left.
    use crate::hid::PollContext;
    use crate::drivers::*;

    pub fn run_all(ctx: &mut PollContext) {
        poll_glorious(ctx);      // also Hitscan
        poll_aula(ctx);          // AULA F75 / F87 Pro / F99 / HERO 68 Air keyboards (before Kysona)
        poll_dareu(ctx);         // DAREU EM901X receiver (split feature/input collections)
        poll_darmoshark(ctx);    // Darmoshark M3 over its 2.4 GHz receiver
        poll_atk_serial(ctx);    // ATK N9 Pro / N9 Ultra headsets (virtual COM port)
        poll_pulsar(ctx);        // before Kysona, which also scans the 3710 vendor id
        poll_atk_bitmouse(ctx);  // before Kysona, which would probe the NK dongle with the wrong protocol
        poll_kysona(ctx);        // also Pulsar, ATK / VXE, Hitscan Hyperlight
        poll_keychron(ctx);      // Keychron mice, Nape Pro trackball (Link-KM receiver)
        poll_lamzu(ctx);         // LAMZU mice on vendor ids 373E / 37B0
        poll_endgame(ctx);       // Endgame Gear 4K mice (OP1w 4k, XM2w 4k) on the 4K dongle
        poll_vaxee(ctx);         // VAXEE 4K receiver / NP-01S V2 cable, read-only battery commands
        poll_wlmouse(ctx);       // WLMouse Beast X family (VID 36A7)
        poll_finalmouse(ctx);    // Finalmouse UltralightX / Starlight X dongles (VID 361D), read-only GETs
        poll_ninjutso(ctx);      // Sora V2 1K receiver (1915:AE1C) and Ten / Ten Air (093A:EB01 / 093A:E020)
        poll_sprime(ctx);        // Sprime PM1 (1915:AC1C / AD8C receivers, AC11-AC13 cable)
        poll_rongyuan(ctx);      // Rongyuan receivers (Attack Shark, Ajazz keyboards, ...)
        poll_sonix(ctx);         // SONiX keyboards on their 2.4 GHz dongle (AJAZZ AK820 MAX, AK980 V2, AULA F108 Pro)
        poll_sony_inzone(ctx);   // Sony INZONE H9 II / H5 / Buds
        poll_fractal(ctx);       // Fractal Design Scape headset (dongle or cable)
        poll_jabra(ctx);         // Jabra headsets behind a Link 380 / 390 dongle
        poll_jbl(ctx);           // JBL Quantum 520 / 650 / 850 / 950 wireless headsets
        poll_rog(ctx);           // ASUS ROG keyboards, mice and the Pelta headset
        poll_zowie(ctx);         // BenQ ZOWIE EC-CW / DW / U2 mice
        poll_royal_kludge(ctx);  // Royal Kludge MG6 Pro (VID 2E3C, QiWang protocol)
        poll_mchose(ctx);        // MCHOSE mice (L7 / M7 / A7 / K7 families, VID 5253)
        poll_rapoo(ctx);         // Rapoo VT gaming mice incl. VT1 Pro Max (passive battery reports)
        poll_areson(ctx);        // Areson 25A7 receivers (Redragon M913 / M915)
        poll_mchose_g3(ctx);     // MCHOSE G3 V2 wireless mouse (VID 3837)
        poll_msi(ctx);           // MSI VERSA 300 ELITE WIRELESS on its dongle (0DB0:9E22)
        poll_machenike(ctx);     // before Ajazz in poll_misc_mice, which shares the L7's 248A vendor id
        poll_mchose_modern(ctx); // MCHOSE K7 V2 Ultra+ and other new-family mice (VID 3837 receiver)
        poll_misc_mice(ctx);     // Motospeed X6, Delux M900 Pro / M800 Pro, Ajazz AJ179 and AJ159/AJ-series
        poll_fantech(ctx);       // Fantech Helios Go XD5 (wired 25A7:FA7B, dongle 25A7:FA7C)
        poll_razer_headsets(ctx); // before the generic Razer driver, which shares the vendor id
        poll_hyperx(ctx);
        poll_logitech_g435(ctx); // before the HID++ driver, which shares the vendor id
        poll_astro(ctx);         // A50 X / Gen 5 vendor protocol (before generic Logitech)
        poll_logitech(ctx);
        poll_razer(ctx);
        poll_steelseries(ctx);
        poll_corsair(ctx);
        poll_coolermaster(ctx);
        poll_playstation(ctx);
        poll_steam_controller(ctx);
        poll_gamesir(ctx);       // Nova Lite / Nova 2 / Nova 2 Lite
        poll_flydigi(ctx);       // Vader 5 Pro vendor battery channel
        poll_gamesir_cyclone(ctx); // Cyclone 2 (XInput mode)
        poll_8bitdo(ctx);        // Ultimate 2 Wireless in D-input mode (2DC8:6012)
        poll_airpods(ctx);       // before the Bluetooth fallback, which has no level for AirPods
        poll_phonelink(ctx);
        poll_galaxy_buds(ctx);   // before the Bluetooth fallback, which skips devices already listed by name
        poll_moondrop(ctx);
        poll_headsetcontrol(ctx);
        poll_bluetooth(ctx);     // before the generic HID check: Windows' own level wins for the same device
        poll_generic_hid(ctx);
        poll_xinput(ctx);
    }
}
