//! Fallbacks that work for any vendor:
//!  * HID devices exposing a standard battery usage (Generic Device Controls "Battery Strength",
//!    Battery System "Absolute State Of Charge") in a feature or input report.
//!  * Bluetooth devices: Windows keeps the level it reads over HFP (classic) or the GATT Battery
//!    Service (LE) in a device property, the same value Settings > Bluetooth & devices shows.

use std::collections::{BTreeMap, BTreeSet};

use windows_sys::Win32::Devices::DeviceAndDriverInstallation::{
    CM_Get_DevNode_Status, CR_SUCCESS, DIGCF_ALLCLASSES, DIGCF_PRESENT, DN_HAS_PROBLEM, SP_DEVICE_INTERFACE_DATA, SP_DEVINFO_DATA,
    SetupDiCreateDeviceInfoList, SetupDiDestroyDeviceInfoList, SetupDiEnumDeviceInfo, SetupDiGetClassDevsW, SetupDiGetDeviceInstanceIdW,
    SetupDiGetDeviceInterfaceDetailW, SetupDiGetDevicePropertyW, SetupDiOpenDeviceInterfaceW,
};
use windows_sys::Win32::Devices::HumanInterfaceDevice::{
    HIDP_CAPS, HIDP_STATUS_SUCCESS, HIDP_VALUE_CAPS, HidD_FreePreparsedData, HidD_GetFeature, HidD_GetInputReport, HidD_GetPreparsedData,
    HidP_Feature, HidP_GetCaps, HidP_GetUsageValue, HidP_GetValueCaps, HidP_Input, PHIDP_PREPARSED_DATA,
};
use windows_sys::Win32::Devices::Properties::{
    DEVPKEY_Device_ContainerId, DEVPKEY_Device_DeviceDesc, DEVPKEY_Device_FriendlyName, DEVPKEY_DeviceContainer_Category, DEVPROP_BOOLEAN,
    DEVPROP_FALSE, DEVPROP_TRUE, DEVPROP_TYPE_BOOLEAN, DEVPROP_TYPE_BYTE, DEVPROP_TYPE_GUID, DEVPROP_TYPE_STRING, DEVPROP_TYPE_STRING_LIST,
    DEVPROP_TYPE_UINT32, DEVPROPTYPE,
};
use windows_sys::Win32::Foundation::{CloseHandle, DEVPROPKEY, INVALID_HANDLE_VALUE};
use windows_sys::Win32::Storage::FileSystem::{CreateFileW, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING};
use windows_sys::Win32::System::Com::StringFromGUID2;
use windows_sys::core::GUID;

use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{PollContext, clamp100, guess_kind, hex4, hid_product, kind_from_collections};
use crate::win::{to_wide, wide_to_string};

// The device property keys Windows exposes the Bluetooth battery level and connected state under
// (they are not in devpkey.h).
const K_BT_BATTERY: DEVPROPKEY = DEVPROPKEY {
    fmtid: GUID { data1: 0x104EA319, data2: 0x6EE2, data3: 0x4701, data4: [0xBD, 0x47, 0x8D, 0xDB, 0xF4, 0x25, 0xBB, 0xE5] },
    pid: 2,
};
const K_IS_CONNECTED: DEVPROPKEY = DEVPROPKEY {
    fmtid: GUID { data1: 0x83DA6326, data2: 0x97A6, data3: 0x4088, data4: [0x94, 0x53, 0xA1, 0x92, 0x3F, 0x57, 0x3B, 0x29] },
    pid: 15,
};
const K_CLASS_OF_DEVICE: DEVPROPKEY = DEVPROPKEY {
    fmtid: GUID { data1: 0x2BD67D8B, data2: 0x8BEB, data3: 0x48D5, data4: [0x87, 0xE0, 0x6C, 0xDA, 0x34, 0x28, 0x04, 0x0A] },
    pid: 10,
};

fn is_battery_usage(page: u16, usage: u16) -> bool {
    (page == 0x06 && usage == 0x20) || (page == 0x85 && usage == 0x65)
}

fn kind_from_class_of_device(cod: u32) -> DeviceKind {
    let major = (cod >> 8) & 0x1F;
    let minor = (cod >> 2) & 0x3F;
    if major == 0x04 {
        return DeviceKind::Headset;
    }
    if major == 0x05 {
        if (minor & 0x0F) == 0x01 || (minor & 0x0F) == 0x02 {
            return DeviceKind::Gamepad;
        }
        if (minor >> 4) == 1 {
            return DeviceKind::Keyboard;
        }
        if (minor >> 4) == 2 {
            return DeviceKind::Mouse;
        }
    }
    DeviceKind::Other
}

/// A single string device property; "" when missing.
fn str_prop(di: isize, dd: *const SP_DEVINFO_DATA, key: &DEVPROPKEY) -> String {
    let mut t: DEVPROPTYPE = 0;
    let mut buf = [0u16; 256];
    unsafe {
        if SetupDiGetDevicePropertyW(di, dd, key, &mut t, buf.as_mut_ptr() as *mut u8, (buf.len() * 2 - 2) as u32, std::ptr::null_mut(), 0)
            != 0
            && t == DEVPROP_TYPE_STRING
        {
            return wide_to_string(&buf);
        }
    }
    String::new()
}

/// Container properties like the category are string lists; only the first entry matters here.
fn first_string_prop(di: isize, dd: *const SP_DEVINFO_DATA, key: &DEVPROPKEY) -> String {
    let mut t: DEVPROPTYPE = 0;
    let mut buf = [0u16; 256];
    unsafe {
        if SetupDiGetDevicePropertyW(di, dd, key, &mut t, buf.as_mut_ptr() as *mut u8, (buf.len() * 2 - 2) as u32, std::ptr::null_mut(), 0)
            != 0
            && (t == DEVPROP_TYPE_STRING_LIST || t == DEVPROP_TYPE_STRING)
        {
            return wide_to_string(&buf);
        }
    }
    String::new()
}

/// Classic Bluetooth devices carry a Class of Device, but LE devices (BTHLE\DEV_...) usually do
/// not, so KindFromClassOfDevice has nothing to work with and a LE keyboard or mouse ends up as
/// "Other". Windows still files the device under a category for Settings > Bluetooth & devices;
/// use it.
fn kind_from_category(c: &str) -> DeviceKind {
    if c == "Input.Keyboard" {
        return DeviceKind::Keyboard;
    }
    if c == "Input.Mouse" {
        return DeviceKind::Mouse;
    }
    if c == "Input.Gaming" {
        return DeviceKind::Gamepad;
    }
    if c.starts_with("Communication.Headset") || c == "Audio.Headphones" {
        return DeviceKind::Headset;
    }
    DeviceKind::Other
}

/// Bluetooth LE keyboards that also expose a mouse collection (for the knob or macros), so
/// KindFromCollections would call them a mouse. Matched on the exact HID vid/pid seen on the LE link.
///  * 3151:4013 Attack Shark K86 (Rongyuan firmware) over Bluetooth, from the reporter's --dump in
///    batterymon-proto#168. Its USB ids are 3151:4011 / 4015 (OpenRGB issue 4074).
fn kind_from_ble_ids(vid: u16, pid: u16) -> DeviceKind {
    if vid == 0x3151 && pid == 0x4013 {
        return DeviceKind::Keyboard;
    }
    DeviceKind::Other
}

fn strip_service_suffix(n: String) -> String {
    for suf in [" Hands-Free AG", " Hands-Free", " Avrcp Transport", " Stereo", " Audio Gateway"] {
        if n.len() > suf.len() && n.ends_with(suf) {
            return n[..n.len() - suf.len()].to_string();
        }
    }
    n
}

/// Container id ("{...}") of the physical device an HID interface belongs to, formatted like
/// PollBluetooth's keys, or "" if unknown. Uses SetupAPI: CM_Get_Device_Interface_PropertyW is
/// missing from older MinGW import libraries.
fn container_of(path: &str) -> String {
    let di = unsafe { SetupDiCreateDeviceInfoList(std::ptr::null(), std::ptr::null_mut()) };
    if di == -1 {
        return String::new();
    } // INVALID_HANDLE_VALUE
    let mut result = String::new();
    unsafe {
        let mut ifd: SP_DEVICE_INTERFACE_DATA = std::mem::zeroed();
        ifd.cbSize = std::mem::size_of::<SP_DEVICE_INTERFACE_DATA>() as u32;
        let mut dd: SP_DEVINFO_DATA = std::mem::zeroed();
        dd.cbSize = std::mem::size_of::<SP_DEVINFO_DATA>() as u32;
        let mut t: DEVPROPTYPE = 0;
        let mut g: GUID = std::mem::zeroed();
        let wide = to_wide(path);
        if SetupDiOpenDeviceInterfaceW(di, wide.as_ptr(), 0, &mut ifd) != 0
            && SetupDiGetDeviceInterfaceDetailW(di, &ifd, std::ptr::null_mut(), 0, std::ptr::null_mut(), &mut dd) == 0
            && dd.DevInst != 0
            && SetupDiGetDevicePropertyW(
                di,
                &dd,
                &DEVPKEY_Device_ContainerId,
                &mut t,
                &mut g as *mut GUID as *mut u8,
                std::mem::size_of::<GUID>() as u32,
                std::ptr::null_mut(),
                0,
            ) != 0
            && t == DEVPROP_TYPE_GUID
        {
            let mut buf = [0u16; 64];
            StringFromGUID2(&g, buf.as_mut_ptr(), 64);
            result = wide_to_string(&buf);
        }
        SetupDiDestroyDeviceInfoList(di);
    }
    result
}

pub fn poll_generic_hid(ctx: &mut PollContext) {
    // Drawing tablets and pen displays (any collection on the Digitizers page 0D) are never read:
    // polling one for a battery report flipped the Y axis of an XP-Pen Deco Fun S (issue #232).
    let mut digitizers: Vec<(u16, u16)> = Vec::new();
    for c in &ctx.colls {
        if c.page() == 0x0D {
            digitizers.push((c.vid, c.pid));
        }
    }
    let colls = ctx.colls.clone(); // owned copies: the C++ iterates pointers while calling &mut ctx
    for c in &colls {
        if ctx.is_claimed(c.vid, c.pid) {
            continue;
        }
        if c.page() == 0x84 || c.page() == 0x85 {
            continue;
        } // UPS / power supplies
        if digitizers.contains(&(c.vid, c.pid)) {
            continue;
        }
        // Same physical device already shown with Windows' Bluetooth level (its HID field can read 0).
        if !ctx.bt_containers.is_empty() && ctx.bt_containers.contains(&container_of(&c.path)) {
            continue;
        }
        let wide = to_wide(&c.path);
        let h = unsafe {
            CreateFileW(wide.as_ptr(), 0, FILE_SHARE_READ | FILE_SHARE_WRITE, std::ptr::null(), OPEN_EXISTING, 0, std::ptr::null_mut())
        };
        if h == INVALID_HANDLE_VALUE {
            continue;
        }
        let mut pp: PHIDP_PREPARSED_DATA = 0;
        if !unsafe { HidD_GetPreparsedData(h, &mut pp) } {
            unsafe { CloseHandle(h) };
            continue;
        }
        // The core HidCaps keeps report lengths only; the value-cap counts the C++ reads from its
        // copy of HIDP_CAPS are re-derived here (same device, same HidP_GetCaps).
        let mut caps: HIDP_CAPS = unsafe { std::mem::zeroed() };
        unsafe { HidP_GetCaps(pp, &mut caps) };

        let mut pct: i32 = -1;
        for typ in [HidP_Feature, HidP_Input] {
            let mut n = if typ == HidP_Feature { caps.NumberFeatureValueCaps } else { caps.NumberInputValueCaps };
            let len = if typ == HidP_Feature { c.feat_len() } else { c.in_len() };
            if n == 0 || len == 0 {
                continue;
            }
            let mut vc: Vec<HIDP_VALUE_CAPS> = vec![HIDP_VALUE_CAPS::default(); n as usize];
            if unsafe { HidP_GetValueCaps(typ, vc.as_mut_ptr(), &mut n, pp) } != HIDP_STATUS_SUCCESS {
                continue;
            }
            for i in 0..n {
                if pct >= 0 {
                    break;
                }
                let v = &vc[i as usize];
                let u = if v.IsRange { unsafe { v.Anonymous.Range.UsageMin } } else { unsafe { v.Anonymous.NotRange.Usage } };
                if !is_battery_usage(v.UsagePage, u) {
                    continue;
                }
                let mut buf = vec![0u8; len as usize];
                buf[0] = v.ReportID;
                let got = if typ == HidP_Feature {
                    unsafe { HidD_GetFeature(h, buf.as_mut_ptr() as *mut _, len as u32) }
                } else {
                    unsafe { HidD_GetInputReport(h, buf.as_mut_ptr() as *mut _, len as u32) }
                };
                if !got {
                    continue;
                }
                let mut val: u32 = 0;
                if unsafe { HidP_GetUsageValue(typ, v.UsagePage, v.LinkCollection, u, &mut val, pp, buf.as_ptr(), len as u32) }
                    != HIDP_STATUS_SUCCESS
                {
                    continue;
                }
                // Apple devices (Magic Trackpad / Mouse / Keyboard) report a plain percentage while
                // declaring a 0-255 range; Linux handles them with HID_BATTERY_QUIRK_PERCENT.
                let percent_quirk = c.vid == 0x05AC && val <= 100;
                if percent_quirk {
                    pct = val as i32;
                } else if v.LogicalMax > v.LogicalMin {
                    pct = clamp100((val as i32 - v.LogicalMin) * 100 / (v.LogicalMax - v.LogicalMin));
                } else if val <= 100 {
                    pct = val as i32;
                }
            }
            if pct >= 0 {
                break;
            }
        }
        unsafe {
            HidD_FreePreparsedData(pp);
            CloseHandle(h);
        }
        if pct < 0 {
            continue;
        }
        let mut s = DeviceStatus::default();
        s.name = hid_product(c);
        if s.name.is_empty() {
            s.name = "Wireless device".into();
        }
        s.key = format!("hid:{}:{}", hex4(c.vid), hex4(c.pid));
        s.via = "HID".into();
        s.kind = kind_from_collections(&ctx.colls, c.vid, c.pid);
        if s.kind == DeviceKind::Other {
            s.kind = guess_kind(&s.name);
        }
        s.percent = pct;
        ctx.add(s, c.vid, c.pid);
    }
}

pub fn poll_bluetooth(ctx: &mut PollContext) {
    let di = unsafe { SetupDiGetClassDevsW(std::ptr::null(), std::ptr::null(), std::ptr::null_mut(), DIGCF_ALLCLASSES | DIGCF_PRESENT) };
    if di == -1 {
        return;
    } // INVALID_HANDLE_VALUE

    struct Found {
        pct: i32,
        name: String,
        connected: bool,
    }
    let mut container_name: BTreeMap<String, String> = BTreeMap::new(); // container id -> name of the main BT device node
    let mut container_cod: BTreeMap<String, u32> = BTreeMap::new(); // container id -> class of device
    let mut container_cat: BTreeMap<String, String> = BTreeMap::new(); // container id -> device container category
    let mut container_conn: BTreeMap<String, bool> = BTreeMap::new(); // container id -> main BT device node connected
    let mut battery: BTreeMap<String, Found> = BTreeMap::new();
    unsafe {
        let mut i: u32 = 0;
        loop {
            let mut dd: SP_DEVINFO_DATA = std::mem::zeroed();
            dd.cbSize = std::mem::size_of::<SP_DEVINFO_DATA>() as u32;
            if SetupDiEnumDeviceInfo(di, i, &mut dd) == 0 {
                break;
            }
            i += 1;
            let mut inst = [0u16; 512];
            if SetupDiGetDeviceInstanceIdW(di, &dd, inst.as_mut_ptr(), 512, std::ptr::null_mut()) == 0 {
                continue;
            }
            let inst = wide_to_string(&inst);
            if !(inst.starts_with("BTHENUM\\") || inst.starts_with("BTHLE\\") || inst.starts_with("BTHLEDEVICE\\")) {
                continue;
            }

            let mut container: GUID = std::mem::zeroed();
            let mut t: DEVPROPTYPE = 0;
            let mut cid = inst.clone();
            if SetupDiGetDevicePropertyW(
                di,
                &dd,
                &DEVPKEY_Device_ContainerId,
                &mut t,
                &mut container as *mut GUID as *mut u8,
                std::mem::size_of::<GUID>() as u32,
                std::ptr::null_mut(),
                0,
            ) != 0
            {
                let mut g = [0u16; 64];
                StringFromGUID2(&container, g.as_mut_ptr(), 64);
                cid = wide_to_string(&g);
            }
            let mut name = str_prop(di, &dd, &DEVPKEY_Device_FriendlyName);
            if name.is_empty() {
                name = str_prop(di, &dd, &DEVPKEY_Device_DeviceDesc);
            }
            if inst.starts_with("BTHENUM\\DEV_") || inst.starts_with("BTHLE\\DEV_") {
                container_name.insert(cid.clone(), name.clone());
                let mut cod: u32 = 0;
                if SetupDiGetDevicePropertyW(
                    di,
                    &dd,
                    &K_CLASS_OF_DEVICE,
                    &mut t,
                    &mut cod as *mut u32 as *mut u8,
                    4,
                    std::ptr::null_mut(),
                    0,
                ) != 0
                    && t == DEVPROP_TYPE_UINT32
                {
                    container_cod.insert(cid.clone(), cod);
                }
                let cat = first_string_prop(di, &dd, &DEVPKEY_DeviceContainer_Category);
                if !cat.is_empty() {
                    container_cat.insert(cid.clone(), cat);
                }
                let mut conn: DEVPROP_BOOLEAN = 0;
                if SetupDiGetDevicePropertyW(
                    di,
                    &dd,
                    &K_IS_CONNECTED,
                    &mut t,
                    &mut conn as *mut DEVPROP_BOOLEAN as *mut u8,
                    1,
                    std::ptr::null_mut(),
                    0,
                ) != 0
                    && t == DEVPROP_TYPE_BOOLEAN
                {
                    container_conn.insert(cid.clone(), conn != DEVPROP_FALSE);
                }
            }

            let mut pct: u8 = 0;
            if SetupDiGetDevicePropertyW(di, &dd, &K_BT_BATTERY, &mut t, &mut pct as *mut u8, 1, std::ptr::null_mut(), 0) == 0
                || t != DEVPROP_TYPE_BYTE
            {
                continue;
            }
            // The service node's own connected flag is only a fallback: headphones keep their level
            // on the Hands-Free node, which reads as disconnected while audio runs over A2DP. The
            // main device node decides below when there is one.
            let mut conn: DEVPROP_BOOLEAN = DEVPROP_TRUE;
            if SetupDiGetDevicePropertyW(
                di,
                &dd,
                &K_IS_CONNECTED,
                &mut t,
                &mut conn as *mut DEVPROP_BOOLEAN as *mut u8,
                1,
                std::ptr::null_mut(),
                0,
            ) == 0
                || t != DEVPROP_TYPE_BOOLEAN
            {
                conn = DEVPROP_TRUE;
            }
            let mut st: u32 = 0;
            let mut prob: u32 = 0;
            if CM_Get_DevNode_Status(&mut st, &mut prob, dd.DevInst, 0) == CR_SUCCESS && (st & DN_HAS_PROBLEM) != 0 {
                continue;
            }
            if pct > 100 {
                continue;
            }
            if let Some(prev) = battery.get(&cid) {
                if prev.connected && conn == DEVPROP_FALSE {
                    continue;
                } // prefer a live node
            }
            battery.insert(cid, Found { pct: pct as i32, name: strip_service_suffix(name), connected: conn != DEVPROP_FALSE });
        }
        SetupDiDestroyDeviceInfoList(di);
    }

    // Physical devices a driver above already reported over a HID interface on the Bluetooth link
    // itself (e.g. Logitech HID++ names the LIFT "Logitech LIFT VERTICAL ERGONOMIC MOUSE" while
    // Bluetooth calls it "LIFT", so the name check below misses it).
    let mut reported: BTreeSet<String> = BTreeSet::new();
    let mut hid_ids: BTreeMap<String, (u16, u16)> = BTreeMap::new(); // container id -> HID vid/pid on that device
    for c in &ctx.colls {
        let cont = container_of(&c.path);
        hid_ids.insert(cont.clone(), (c.vid, c.pid));
        if ctx.is_claimed(c.vid, c.pid) {
            reported.insert(cont);
        }
    }

    for (cid, f) in &battery {
        if reported.contains(cid) {
            continue;
        }
        let skip = match container_conn.get(cid) {
            Some(&conn) => !conn,
            None => !f.connected,
        };
        if skip {
            continue;
        }
        let mut s = DeviceStatus::default();
        s.key = format!("bt:{cid}");
        s.name = match container_name.get(cid) {
            Some(name) if !name.is_empty() => name.clone(),
            _ => f.name.clone(),
        };
        if s.name.is_empty() {
            s.name = "Bluetooth device".into();
        }
        // Skip devices a vendor driver already reported over HID++ / Bragi on the same link.
        if ctx.out.iter().any(|o| o.name == s.name) {
            continue;
        }
        s.via = "Bluetooth".into();
        s.percent = f.pct;
        s.kind = container_cod.get(cid).map(|&cod| kind_from_class_of_device(cod)).unwrap_or(DeviceKind::Other);
        if s.kind == DeviceKind::Other {
            if let Some(cat) = container_cat.get(cid) {
                s.kind = kind_from_category(cat);
            }
        }
        // Bluetooth LE devices have no class of device; their HID collections tell a mouse from a keyboard.
        if let Some(&(vid, pid)) = hid_ids.get(cid) {
            if s.kind == DeviceKind::Other {
                s.kind = kind_from_ble_ids(vid, pid);
            }
            if s.kind == DeviceKind::Other {
                s.kind = kind_from_collections(&ctx.colls, vid, pid);
            }
        }
        if s.kind == DeviceKind::Other {
            s.kind = guess_kind(&s.name);
        }
        ctx.out.push(s);
        ctx.bt_containers.insert(cid.clone());
    }
}
