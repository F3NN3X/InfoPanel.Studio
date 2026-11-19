//! Xbox controllers.
//!  1. Windows.Gaming.Input (WinRT): every Xbox controller Windows knows (Xbox Wireless adapter,
//!     USB, Bluetooth) with a real battery report (remaining / full mWh -> %).
//!  2. XInput fallback: coarse levels (empty / low / medium / full) shown as text, also covering
//!     headsets plugged into a controller.

use std::ffi::c_void;
use std::sync::{Mutex, OnceLock};

use windows_sys::core::GUID;
use windows_sys::Win32::Foundation::ERROR_SUCCESS;
use windows_sys::Win32::System::LibraryLoader::{
    GetProcAddress, LoadLibraryExW, LOAD_LIBRARY_SEARCH_SYSTEM32,
};
use windows_sys::Win32::UI::Input::XboxController::{
    BATTERY_DEVTYPE_GAMEPAD, BATTERY_DEVTYPE_HEADSET, BATTERY_LEVEL_EMPTY, BATTERY_LEVEL_LOW,
    BATTERY_LEVEL_MEDIUM, BATTERY_TYPE_DISCONNECTED, BATTERY_TYPE_UNKNOWN, BATTERY_TYPE_WIRED,
    XINPUT_BATTERY_INFORMATION, XINPUT_STATE,
};

use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{clamp100, hex4, PollContext};
use crate::win::{sleep_ms, to_wide, wide_to_string};

// ---- the hand-rolled WinRT ABI ------------------------------------------------------------------
// The C++ file compiles against MinGW's WIDL-generated headers; the vtable slots and IIDs below are
// exactly the ones those headers (and the Windows metadata they were generated from) define.

type Hstring = *mut c_void;

// RoInitialize/RoGetActivationFactory and the HSTRING helpers are not in the crate's enabled
// windows-sys modules; declare the combase.dll exports directly, like the C++ <roapi.h> include.
#[link(name = "runtimeobject")]  // SDK import lib for combase.dll's Ro* exports (the C++ -lruntimeobject)
unsafe extern "system" {
    fn RoInitialize(init_type: u32) -> i32;
    fn RoGetActivationFactory(activatable_class_id: Hstring, iid: *const GUID,
                              factory: *mut *mut c_void) -> i32;
    fn WindowsCreateString(source: *const u16, length: u32, string: *mut Hstring) -> i32;
    fn WindowsDeleteString(string: Hstring) -> i32;
    fn WindowsGetStringRawBuffer(string: Hstring, length: *mut u32) -> *const u16;
}

const RO_INIT_MULTITHREADED: u32 = 1;

// ABI::Windows::System::Power::BatteryStatus
const BATTERY_STATUS_NOT_PRESENT: i32 = 0;
const BATTERY_STATUS_CHARGING: i32 = 3;

// __uuidof(...) from the headers the C++ file compiled against.
const IID_IRAW_GAME_CONTROLLER_STATICS: GUID = GUID {
    data1: 0xEB8D0792, data2: 0xE95A, data3: 0x4B19,
    data4: [0xAF, 0xC7, 0x0A, 0x59, 0xF8, 0xBF, 0x75, 0x9E],
};
const IID_IGAME_CONTROLLER_BATTERY_INFO: GUID = GUID {
    data1: 0xDCECC681, data2: 0x3963, data3: 0x4DA6,
    data4: [0x95, 0x5D, 0x55, 0x3F, 0x3B, 0x6F, 0x61, 0x61],
};
const IID_IRAW_GAME_CONTROLLER2: GUID = GUID {
    data1: 0x43C0C035, data2: 0xBB73, data3: 0x4756,
    data4: [0xA7, 0x87, 0x3E, 0xD6, 0xBE, 0xA6, 0x17, 0xBD],
};

// Every WinRT interface starts with IUnknown's three slots followed by IInspectable's.
#[repr(C)]
struct InspectableVtbl {
    query_interface: unsafe extern "system" fn(*mut c_void, *const GUID, *mut *mut c_void) -> i32,
    add_ref: unsafe extern "system" fn(*mut c_void) -> u32,
    release: unsafe extern "system" fn(*mut c_void) -> u32,
    get_iids: unsafe extern "system" fn(),
    get_runtime_class_name: unsafe extern "system" fn(),
    get_trust_level: unsafe extern "system" fn(),
}

unsafe fn query_interface(this: *mut c_void, iid: *const GUID, out: *mut *mut c_void) -> i32 {
    // this -> interface struct -> lpVtbl -> vtable (the C++ This->lpVtbl->QueryInterface chain).
    unsafe {
        let vtbl = &**(this as *const *const InspectableVtbl);
        (vtbl.query_interface)(this, iid, out)
    }
}

/// The C++ `Release(T*& p)` helper: releases when non-null, never leaves a dangling pointer.
unsafe fn release(this: *mut c_void) {
    if !this.is_null() {
        unsafe {
            let vtbl = &**(this as *const *const InspectableVtbl);
            (vtbl.release)(this);
        }
    }
}

// Windows.Foundation.IReference<INT32> (__FIReference_1_INT32)
#[repr(C)]
#[allow(non_snake_case)]  // lpVtbl: the ABI field name from the C++ headers
struct ReferenceI32 { lpVtbl: *const ReferenceI32Vtbl }
#[repr(C)]
struct ReferenceI32Vtbl {
    header: InspectableVtbl,
    get_value: unsafe extern "system" fn(*mut c_void, *mut i32) -> i32,
}

// ABI::Windows::Devices::Power::IBatteryReport
#[repr(C)]
#[allow(non_snake_case)]  // lpVtbl: the ABI field name from the C++ headers
struct BatteryReport { lpVtbl: *const BatteryReportVtbl }
#[repr(C)]
struct BatteryReportVtbl {
    header: InspectableVtbl,
    get_charge_rate_in_milliwatt_hours: unsafe extern "system" fn(*mut c_void, *mut *mut ReferenceI32) -> i32,
    get_design_capacity_in_milliwatt_hours: unsafe extern "system" fn(*mut c_void, *mut *mut ReferenceI32) -> i32,
    get_full_charge_capacity_in_milliwatt_hours: unsafe extern "system" fn(*mut c_void, *mut *mut ReferenceI32) -> i32,
    get_remaining_capacity_in_milliwatt_hours: unsafe extern "system" fn(*mut c_void, *mut *mut ReferenceI32) -> i32,
    get_status: unsafe extern "system" fn(*mut c_void, *mut i32) -> i32,
}

// ABI::Windows::Gaming::Input::IGameControllerBatteryInfo
#[repr(C)]
#[allow(non_snake_case)]  // lpVtbl: the ABI field name from the C++ headers
struct GameControllerBatteryInfo { lpVtbl: *const GameControllerBatteryInfoVtbl }
#[repr(C)]
struct GameControllerBatteryInfoVtbl {
    header: InspectableVtbl,
    try_get_battery_report: unsafe extern "system" fn(*mut c_void, *mut *mut BatteryReport) -> i32,
}

// ABI::Windows::Gaming::Input::IRawGameController
#[repr(C)]
#[allow(non_snake_case)]  // lpVtbl: the ABI field name from the C++ headers
struct RawGameController { lpVtbl: *const RawGameControllerVtbl }
#[repr(C)]
struct RawGameControllerVtbl {
    header: InspectableVtbl,
    get_axis_count: unsafe extern "system" fn(),
    get_button_count: unsafe extern "system" fn(),
    get_force_feedback_motors: unsafe extern "system" fn(),
    get_hardware_product_id: unsafe extern "system" fn(*mut c_void, *mut u16) -> i32,
    get_hardware_vendor_id: unsafe extern "system" fn(*mut c_void, *mut u16) -> i32,
    get_switch_count: unsafe extern "system" fn(),
    get_button_label: unsafe extern "system" fn(),
    get_current_reading: unsafe extern "system" fn(),
    get_switch_kind: unsafe extern "system" fn(),
}

// ABI::Windows::Gaming::Input::IRawGameController2
#[repr(C)]
#[allow(non_snake_case)]  // lpVtbl: the ABI field name from the C++ headers
struct RawGameController2 { lpVtbl: *const RawGameController2Vtbl }
#[repr(C)]
struct RawGameController2Vtbl {
    header: InspectableVtbl,
    get_simple_haptics_controllers: unsafe extern "system" fn(),
    get_non_roamable_id: unsafe extern "system" fn(),
    get_display_name: unsafe extern "system" fn(*mut c_void, *mut Hstring) -> i32,
}

// ABI::Windows::Foundation::Collections::IVectorView<RawGameController*>
// (__FIVectorView_1_Windows__CGaming__CInput__CRawGameController)
#[repr(C)]
#[allow(non_snake_case)]  // lpVtbl: the ABI field name from the C++ headers
struct VectorView { lpVtbl: *const VectorViewVtbl }
#[repr(C)]
struct VectorViewVtbl {
    header: InspectableVtbl,
    get_at: unsafe extern "system" fn(*mut c_void, u32, *mut *mut RawGameController) -> i32,
    get_size: unsafe extern "system" fn(*mut c_void, *mut u32) -> i32,
    index_of: unsafe extern "system" fn(),
    get_many: unsafe extern "system" fn(),
}

// ABI::Windows::Gaming::Input::IRawGameControllerStatics
#[repr(C)]
#[allow(non_snake_case)]  // lpVtbl: the ABI field name from the C++ headers
struct RawGameControllerStatics { lpVtbl: *const RawGameControllerStaticsVtbl }
#[repr(C)]
struct RawGameControllerStaticsVtbl {
    header: InspectableVtbl,
    add_raw_game_controller_added: unsafe extern "system" fn(),
    remove_raw_game_controller_added: unsafe extern "system" fn(),
    add_raw_game_controller_removed: unsafe extern "system" fn(),
    remove_raw_game_controller_removed: unsafe extern "system" fn(),
    get_raw_game_controllers: unsafe extern "system" fn(*mut c_void, *mut *mut VectorView) -> i32,
    from_game_controller: unsafe extern "system" fn(),
}

// The C++ keeps the factory in a function-local static; a COM pointer is not Send on its own.
#[derive(Clone, Copy)]
struct StaticsPtr(*mut RawGameControllerStatics);
unsafe impl Send for StaticsPtr {}

static WG1_STATICS: Mutex<Option<StaticsPtr>> = Mutex::new(None);

fn statics() -> *mut RawGameControllerStatics {
    let mut g = WG1_STATICS.lock().unwrap();
    if let Some(p) = *g { return p.0; }
    let mut statics: *mut RawGameControllerStatics = std::ptr::null_mut();
    unsafe {
        RoInitialize(RO_INIT_MULTITHREADED);  // our poll thread; harmless if already initialised
        let cls = to_wide("Windows.Gaming.Input.RawGameController");
        let mut name: Hstring = std::ptr::null_mut();
        if WindowsCreateString(cls.as_ptr(), (cls.len() - 1) as u32, &mut name) >= 0 {
            RoGetActivationFactory(name, &IID_IRAW_GAME_CONTROLLER_STATICS,
                                    &mut statics as *mut *mut RawGameControllerStatics as *mut *mut c_void);
            WindowsDeleteString(name);
        }
    }
    if !statics.is_null() {
        sleep_ms(300);  // the controller list fills in asynchronously after first use
    }
    *g = Some(StaticsPtr(statics));
    statics
}

/// Vendors whose controllers report a real battery through Windows.Gaming.Input:
/// Microsoft, and GameSir in Xbox (GIP) mode (e.g. G7 Pro on its receiver, 3537:105E).
fn wgi_vendor(vid: u16) -> bool { vid == 0x045E || vid == 0x3537 }

/// Adds Xbox controllers with a real percentage. Returns how many were added; `third_party` counts
/// the non-Microsoft ones among them.
fn poll_wgi(ctx: &mut PollContext, third_party: &mut i32) -> i32 {
    *third_party = 0;
    let statics = statics();
    if statics.is_null() { return 0; }
    let mut list: *mut VectorView = std::ptr::null_mut();
    unsafe {
        if ((*(*statics).lpVtbl).get_raw_game_controllers)(statics as *mut c_void, &mut list) < 0 || list.is_null() {
            return 0;
        }
    }
    let mut count: u32 = 0;
    unsafe { ((*(*list).lpVtbl).get_size)(list as *mut c_void, &mut count); }
    let mut added = 0;
    for i in 0..count {
        let mut raw: *mut RawGameController = std::ptr::null_mut();
        unsafe {
            if ((*(*list).lpVtbl).get_at)(list as *mut c_void, i, &mut raw) < 0 || raw.is_null() { continue; }
        }
        let mut vid: u16 = 0;
        let mut pid: u16 = 0;
        unsafe {
            ((*(*raw).lpVtbl).get_hardware_vendor_id)(raw as *mut c_void, &mut vid);
            ((*(*raw).lpVtbl).get_hardware_product_id)(raw as *mut c_void, &mut pid);
        }
        let mut info: *mut GameControllerBatteryInfo = std::ptr::null_mut();
        let mut report: *mut BatteryReport = std::ptr::null_mut();
        if wgi_vendor(vid)
            && unsafe { query_interface(raw as *mut c_void, &IID_IGAME_CONTROLLER_BATTERY_INFO,
                                         &mut info as *mut _ as *mut *mut c_void) } >= 0
            && !info.is_null()
            && unsafe { ((*(*info).lpVtbl).try_get_battery_report)(info as *mut c_void, &mut report) } >= 0
            && !report.is_null() {
            let mut rem: *mut ReferenceI32 = std::ptr::null_mut();
            let mut full: *mut ReferenceI32 = std::ptr::null_mut();
            unsafe {
                ((*(*report).lpVtbl).get_remaining_capacity_in_milliwatt_hours)(report as *mut c_void, &mut rem);
                ((*(*report).lpVtbl).get_full_charge_capacity_in_milliwatt_hours)(report as *mut c_void, &mut full);
            }
            let mut r: i32 = 0;
            let mut f: i32 = 0;
            unsafe {
                if !rem.is_null() { ((*(*rem).lpVtbl).get_value)(rem as *mut c_void, &mut r); }
                if !full.is_null() { ((*(*full).lpVtbl).get_value)(full as *mut c_void, &mut f); }
            }
            let mut st: i32 = BATTERY_STATUS_NOT_PRESENT;
            unsafe { ((*(*report).lpVtbl).get_status)(report as *mut c_void, &mut st); }
            if f > 0 && st != BATTERY_STATUS_NOT_PRESENT {
                let mut s = DeviceStatus::default();
                s.key = format!("xbox:{}:{}", hex4(pid), i);
                s.name = "Xbox controller".into();
                let mut raw2: *mut RawGameController2 = std::ptr::null_mut();
                if unsafe { query_interface(raw as *mut c_void, &IID_IRAW_GAME_CONTROLLER2,
                                             &mut raw2 as *mut _ as *mut *mut c_void) } >= 0
                    && !raw2.is_null() {
                    let mut dn: Hstring = std::ptr::null_mut();
                    unsafe {
                        if ((*(*raw2).lpVtbl).get_display_name)(raw2 as *mut c_void, &mut dn) >= 0 && !dn.is_null() {
                            let mut len: u32 = 0;
                            let p = WindowsGetStringRawBuffer(dn, &mut len);
                            if !p.is_null() && len != 0 {
                                s.name = wide_to_string(std::slice::from_raw_parts(p, len as usize));
                            }
                            WindowsDeleteString(dn);
                        }
                    }
                    unsafe { release(raw2 as *mut c_void) };
                }
                // GIP reports a generic "Xbox One Game Controller" for third-party pads.
                if vid == 0x3537 { s.name = "GameSir controller".into(); }
                s.kind = DeviceKind::Gamepad;
                s.via = "Xbox Wireless / Bluetooth".into();
                s.percent = clamp100(r * 100 / f);
                s.charging = st == BATTERY_STATUS_CHARGING;
                ctx.add(s, vid, pid);
                added += 1;
                if vid != 0x045E { *third_party += 1; }
            }
            unsafe {
                release(rem as *mut c_void);
                release(full as *mut c_void);
            }
        }
        unsafe {
            release(report as *mut c_void);
            release(info as *mut c_void);
            release(raw as *mut c_void);
        }
    }
    unsafe { release(list as *mut c_void) };
    added
}

// ---- XInput, loaded dynamically --------------------------------------------------------------

type GetBatteryFn = unsafe extern "system" fn(u32, u8, *mut XINPUT_BATTERY_INFORMATION) -> u32;
type GetStateFn = unsafe extern "system" fn(u32, *mut XINPUT_STATE) -> u32;

struct XInputApi {
    battery: Option<GetBatteryFn>,
    state: Option<GetStateFn>,
}

static XINPUT_API: OnceLock<XInputApi> = OnceLock::new();

/// GetProcAddress as the generic FARPROC fn-pointer type; transmuted at the call sites.
unsafe fn proc(module: *mut c_void, name: &[u8]) -> Option<unsafe extern "system" fn() -> isize> {
    unsafe { GetProcAddress(module, name.as_ptr() as *const u8) }
}

fn load_xinput() -> &'static XInputApi {
    XINPUT_API.get_or_init(|| {
        let mut battery: Option<GetBatteryFn> = None;
        let mut state: Option<GetStateFn> = None;
        for dll in ["xinput1_4.dll", "xinput9_1_0.dll"] {
            let wide = to_wide(dll);
            let module = unsafe { LoadLibraryExW(wide.as_ptr(), std::ptr::null_mut(), LOAD_LIBRARY_SEARCH_SYSTEM32) };
            if !module.is_null() {
                battery = unsafe { proc(module, b"XInputGetBatteryInformation\0") }
                    .map(|f| unsafe { std::mem::transmute::<unsafe extern "system" fn() -> isize, GetBatteryFn>(f) });
                state = unsafe { proc(module, b"XInputGetState\0") }
                    .map(|f| unsafe { std::mem::transmute::<unsafe extern "system" fn() -> isize, GetStateFn>(f) });
                if battery.is_some() && state.is_some() { break; }
            }
        }
        XInputApi { battery, state }
    })
}

pub fn poll_xinput(ctx: &mut PollContext) {
    // An Xbox controller on Bluetooth may already be listed with a real percentage.
    let bt_xbox = ctx.out.iter().any(|s| s.via == "Bluetooth" && s.name.contains("Xbox"));
    let mut third_party = 0;
    let precise = if bt_xbox { 0 } else { poll_wgi(ctx, &mut third_party) };
    // GameSir pads answer XInput's headset query with their own battery ("Full") even with nothing
    // plugged in, so skip headsets when every precisely shown controller is third-party.
    let skip_headset = precise > 0 && third_party == precise;

    let api = load_xinput();
    let (Some(battery), Some(state)) = (api.battery, api.state) else { return };
    let query = |user: u32, dev_type: u8| -> Option<XINPUT_BATTERY_INFORMATION> {
        let mut bi: XINPUT_BATTERY_INFORMATION = unsafe { std::mem::zeroed() };
        if unsafe { battery(user, dev_type, &mut bi) } == ERROR_SUCCESS
            && bi.BatteryType != BATTERY_TYPE_DISCONNECTED
            && bi.BatteryType != BATTERY_TYPE_WIRED {
            Some(bi)
        } else {
            None
        }
    };
    for user in 0..4u32 {
        // The Xbox Wireless adapter answers battery queries for empty slots too (one controller
        // showed up as four "Medium" headsets), so only look at slots with a controller connected.
        let mut pad_state: XINPUT_STATE = unsafe { std::mem::zeroed() };
        if unsafe { state(user, &mut pad_state) } != ERROR_SUCCESS { continue; }
        let pad = query(user, BATTERY_DEVTYPE_GAMEPAD);
        for dev_type in [BATTERY_DEVTYPE_GAMEPAD, BATTERY_DEVTYPE_HEADSET] {
            if dev_type == BATTERY_DEVTYPE_GAMEPAD && (bt_xbox || precise > 0) {
                continue;  // already shown precisely
            }
            if dev_type == BATTERY_DEVTYPE_HEADSET && skip_headset { continue; }
            let bi = if dev_type == BATTERY_DEVTYPE_GAMEPAD {
                match pad {
                    Some(bi) => bi,
                    None => continue,  // !hasPad
                }
            } else {
                let Some(bi) = query(user, dev_type) else { continue };
                // Without a headset plugged in, the headset query can still answer with an unknown type.
                if bi.BatteryType == BATTERY_TYPE_UNKNOWN { continue; }
                // Xbox One / Series controllers echo their own battery back for the headset query (the
                // phantom headsets all read "Medium", same as the controller). Headsets on these
                // controllers are powered by the controller, so a mirrored answer is not a headset.
                if let Some(pad_bi) = pad {
                    if bi.BatteryType == pad_bi.BatteryType && bi.BatteryLevel == pad_bi.BatteryLevel { continue; }
                }
                bi
            };
            let mut s = DeviceStatus::default();
            s.key = format!("xinput:{}:{}", user, dev_type);
            s.name = if dev_type == BATTERY_DEVTYPE_GAMEPAD {
                format!("Xbox controller {}", user + 1)
            } else {
                "Xbox headset".into()
            };
            s.kind = if dev_type == BATTERY_DEVTYPE_GAMEPAD { DeviceKind::Gamepad } else { DeviceKind::Headset };
            s.via = "Xbox Wireless".into();
            match bi.BatteryLevel {
                BATTERY_LEVEL_EMPTY => { s.percent = 5; s.level_text = "Empty".into(); }
                BATTERY_LEVEL_LOW => { s.percent = 25; s.level_text = "Low".into(); }
                BATTERY_LEVEL_MEDIUM => { s.percent = 60; s.level_text = "Medium".into(); }
                _ => { s.percent = 100; s.level_text = "Full".into(); }
            }
            ctx.out.push(s);
        }
    }
}
