//! Apple AirPods / Beats (AirPods Max, AirPods Pro 1/2/3 and AirPods 1-5) over Bluetooth.
//!
//! Windows does not read the battery of AirPods (they report it through Apple-specific HFP
//! commands), so the Bluetooth fallback shows nothing for them. They do broadcast it in clear,
//! several times a second, in the BLE "proximity pairing" message iPhones use for their battery
//! popup: manufacturer data of company 0x004C (Apple), type 0x07, length 0x19:
//!   [0] 07  [1] 19  [2] 01 (paired status mode; 00 is pairing mode)
//!   [3..4] model (LE, = Bluetooth PID, e.g. 0x200A AirPods Max, 0x2014 AirPods Pro 2)
//!   [5] status: bit 5 set = the left bud is the one broadcasting (dual-bud models)
//!   [6] dual-bud: low nibble = broadcasting bud, high nibble = the other one (0-10 = x10 %, 15 = unknown)
//!       single-battery (AirPods Max, Beats headphones): low nibble = battery (0-10 = x10 %), high nibble = 0
//!   [7] high nibble: bit 0 broadcasting/single charging, bit 1 other bud charging, bit 2 case charging
//!       (bit 3 is always set on AirPods Max: 0x80 discharging, 0x90 charging); low nibble: case level
//! (layout from OpenPods / MagicPodsCore / AirPodsDesktop / librepods, verified on AirPods Max 200A).
//!
//! A BluetoothLEAdvertisementWatcher (WinRT) is started the first time a paired Apple audio
//! device is seen and keeps running. Nearby AirPods of other people broadcast the same message
//! with random addresses, so only messages whose model matches the PID of a paired device are
//! used, and the strongest recent signal wins.
#![allow(dead_code)]
#![allow(non_snake_case)] // the WinRT ABI structs keep the Windows SDK vtable member names
#![allow(non_upper_case_globals)] // ... and the C++ IID constant names

use std::collections::{BTreeMap, BTreeSet};
use std::ffi::c_void;
use std::sync::Mutex;

use windows_sys::Win32::Devices::DeviceAndDriverInstallation::{
    DIGCF_ALLCLASSES, DIGCF_PRESENT, SP_DEVINFO_DATA, SetupDiDestroyDeviceInfoList, SetupDiEnumDeviceInfo, SetupDiGetClassDevsW,
    SetupDiGetDeviceInstanceIdW, SetupDiGetDevicePropertyW,
};
use windows_sys::Win32::Devices::Properties::{DEVPKEY_Device_ContainerId, DEVPKEY_Device_FriendlyName, DEVPROP_TYPE_BOOLEAN};
use windows_sys::Win32::Foundation::{DEVPROPKEY, E_NOINTERFACE, S_OK};
use windows_sys::Win32::System::Com::StringFromGUID2;
use windows_sys::core::{GUID, HRESULT, HSTRING, IID_IUnknown, IInspectable_Vtbl, IUnknown_Vtbl};

use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{PollContext, hex4};
use crate::win::{now_ms, sleep_ms, to_wide, wide_to_string};

fn succeeded(hr: HRESULT) -> bool {
    hr >= 0
}
fn failed(hr: HRESULT) -> bool {
    hr < 0
}

// ---- minimal WinRT ABI declarations (windows-sys ships no BluetoothLEAdvertisementWatcher) ----
// Vtable order from the Windows SDK header windows.devices.bluetooth.advertisement.h. The C++
// kept these out of its anonymous namespace so GCC would not devirtualize the calls through
// them; here each interface is just a vtable pointer, so nothing similar is needed.

const IID_Watcher: GUID = GUID::from_u128(0xa6ac336f_f3d3_4297_8d6c_c81ea6623f40);
const IID_ReceivedArgs: GUID = GUID::from_u128(0x27987ddf_e596_41be_8d43_9e6731d4a913);
// ITypedEventHandler<BluetoothLEAdvertisementWatcher, BluetoothLEAdvertisementReceivedEventArgs>
const IID_ReceivedHandler: GUID = GUID::from_u128(0x90eb4eca_d465_5ea0_a61c_033c8c5ecef2);
const IID_BufferByteAccess: GUID = GUID::from_u128(0x905a0fef_bc53_11df_8c49_001e4fc686da);
const IID_Agile: GUID = GUID::from_u128(0x94ea2b94_e9cc_49e0_c0ff_ee64ca8f5b90);
// IID_Unknown is windows_sys::core::IID_IUnknown.

/// windows-sys' GUID carries no PartialEq; the C++ compares GUIDs with operator==.
fn guid_eq(a: &GUID, b: &GUID) -> bool {
    a.data1 == b.data1 && a.data2 == b.data2 && a.data3 == b.data3 && a.data4 == b.data4
}

#[repr(C)]
struct EventRegistrationToken {
    value: i64,
}

// WinRT activation from combase.dll (the C++ pulled these in from roapi.h / winstring.h).
#[link(name = "runtimeobject")] // SDK import lib for combase.dll's Ro* exports (the C++ -lruntimeobject)
unsafe extern "system" {
    fn RoInitialize(init_type: u32) -> HRESULT;
    fn RoActivateInstance(activatable_class_id: HSTRING, instance: *mut *mut c_void) -> HRESULT;
    fn WindowsCreateString(source: *const u16, length: u32, string: *mut HSTRING) -> HRESULT;
    fn WindowsDeleteString(string: HSTRING) -> HRESULT;
}
const RO_INIT_MULTITHREADED: u32 = 0;

#[repr(C)]
struct IBufferAbi {
    vtbl: *const IBufferAbi_Vtbl,
}
#[repr(C)]
struct IBufferAbi_Vtbl {
    base: IInspectable_Vtbl,
    get_Capacity: unsafe extern "system" fn(this: *mut c_void, v: *mut u32) -> HRESULT,
    get_Length: unsafe extern "system" fn(this: *mut c_void, v: *mut u32) -> HRESULT,
    put_Length: unsafe extern "system" fn(this: *mut c_void, v: u32) -> HRESULT,
}
impl IBufferAbi {
    unsafe fn get_Length(&mut self, v: *mut u32) -> HRESULT {
        unsafe { ((*self.vtbl).get_Length)(self as *mut _ as *mut c_void, v) }
    }
}

#[repr(C)]
struct IBufferByteAccessAbi {
    vtbl: *const IBufferByteAccessAbi_Vtbl,
}
#[repr(C)]
struct IBufferByteAccessAbi_Vtbl {
    base: IUnknown_Vtbl,
    Buffer: unsafe extern "system" fn(this: *mut c_void, v: *mut *mut u8) -> HRESULT,
}
impl IBufferByteAccessAbi {
    unsafe fn Buffer(&mut self, v: *mut *mut u8) -> HRESULT {
        unsafe { ((*self.vtbl).Buffer)(self as *mut _ as *mut c_void, v) }
    }
}

#[repr(C)]
struct IManufacturerData {
    vtbl: *const IManufacturerData_Vtbl,
}
#[repr(C)]
struct IManufacturerData_Vtbl {
    base: IInspectable_Vtbl,
    get_CompanyId: unsafe extern "system" fn(this: *mut c_void, v: *mut u16) -> HRESULT,
    put_CompanyId: unsafe extern "system" fn(this: *mut c_void, v: u16) -> HRESULT,
    get_Data: unsafe extern "system" fn(this: *mut c_void, v: *mut *mut IBufferAbi) -> HRESULT,
    put_Data: unsafe extern "system" fn(this: *mut c_void, v: *mut IBufferAbi) -> HRESULT,
}
impl IManufacturerData {
    unsafe fn get_Data(&mut self, v: *mut *mut IBufferAbi) -> HRESULT {
        unsafe { ((*self.vtbl).get_Data)(self as *mut _ as *mut c_void, v) }
    }
}

#[repr(C)]
struct IManufacturerDataView {
    vtbl: *const IManufacturerDataView_Vtbl,
}
#[repr(C)]
struct IManufacturerDataView_Vtbl {
    // IVectorView<BluetoothLEManufacturerData>
    base: IInspectable_Vtbl,
    GetAt: unsafe extern "system" fn(this: *mut c_void, i: u32, v: *mut *mut IManufacturerData) -> HRESULT,
    get_Size: unsafe extern "system" fn(this: *mut c_void, v: *mut u32) -> HRESULT,
}
impl IManufacturerDataView {
    unsafe fn GetAt(&mut self, i: u32, v: *mut *mut IManufacturerData) -> HRESULT {
        unsafe { ((*self.vtbl).GetAt)(self as *mut _ as *mut c_void, i, v) }
    }
    unsafe fn get_Size(&mut self, v: *mut u32) -> HRESULT {
        unsafe { ((*self.vtbl).get_Size)(self as *mut _ as *mut c_void, v) }
    }
}

#[repr(C)]
struct IAdvertisement {
    vtbl: *const IAdvertisement_Vtbl,
}
#[repr(C)]
struct IAdvertisement_Vtbl {
    base: IInspectable_Vtbl,
    get_Flags: unsafe extern "system" fn(this: *mut c_void, v: *mut *mut c_void) -> HRESULT,
    put_Flags: unsafe extern "system" fn(this: *mut c_void, v: *mut c_void) -> HRESULT,
    get_LocalName: unsafe extern "system" fn(this: *mut c_void, v: *mut HSTRING) -> HRESULT,
    put_LocalName: unsafe extern "system" fn(this: *mut c_void, v: HSTRING) -> HRESULT,
    get_ServiceUuids: unsafe extern "system" fn(this: *mut c_void, v: *mut *mut c_void) -> HRESULT,
    get_ManufacturerData: unsafe extern "system" fn(this: *mut c_void, v: *mut *mut c_void) -> HRESULT,
    get_DataSections: unsafe extern "system" fn(this: *mut c_void, v: *mut *mut c_void) -> HRESULT,
    GetManufacturerDataByCompanyId:
        unsafe extern "system" fn(this: *mut c_void, company: u16, v: *mut *mut IManufacturerDataView) -> HRESULT,
    GetSectionsByType: unsafe extern "system" fn(this: *mut c_void, ty: u8, v: *mut *mut c_void) -> HRESULT,
}
impl IAdvertisement {
    unsafe fn GetManufacturerDataByCompanyId(&mut self, company: u16, v: *mut *mut IManufacturerDataView) -> HRESULT {
        unsafe { ((*self.vtbl).GetManufacturerDataByCompanyId)(self as *mut _ as *mut c_void, company, v) }
    }
}

#[repr(C)]
struct IReceivedArgs {
    vtbl: *const IReceivedArgs_Vtbl,
}
#[repr(C)]
struct IReceivedArgs_Vtbl {
    base: IInspectable_Vtbl,
    get_RawSignalStrengthInDBm: unsafe extern "system" fn(this: *mut c_void, v: *mut i16) -> HRESULT,
    get_BluetoothAddress: unsafe extern "system" fn(this: *mut c_void, v: *mut u64) -> HRESULT,
    get_AdvertisementType: unsafe extern "system" fn(this: *mut c_void, v: *mut i32) -> HRESULT,
    get_Timestamp: unsafe extern "system" fn(this: *mut c_void, v: *mut i64) -> HRESULT,
    get_Advertisement: unsafe extern "system" fn(this: *mut c_void, v: *mut *mut IAdvertisement) -> HRESULT,
}
impl IReceivedArgs {
    unsafe fn get_RawSignalStrengthInDBm(&mut self, v: *mut i16) -> HRESULT {
        unsafe { ((*self.vtbl).get_RawSignalStrengthInDBm)(self as *mut _ as *mut c_void, v) }
    }
    unsafe fn get_BluetoothAddress(&mut self, v: *mut u64) -> HRESULT {
        unsafe { ((*self.vtbl).get_BluetoothAddress)(self as *mut _ as *mut c_void, v) }
    }
    unsafe fn get_Advertisement(&mut self, v: *mut *mut IAdvertisement) -> HRESULT {
        unsafe { ((*self.vtbl).get_Advertisement)(self as *mut _ as *mut c_void, v) }
    }
}

#[repr(C)]
struct IWatcher {
    vtbl: *const IWatcher_Vtbl,
}
#[repr(C)]
struct IWatcher_Vtbl {
    base: IInspectable_Vtbl,
    get_MinSamplingInterval: unsafe extern "system" fn(this: *mut c_void, v: *mut i64) -> HRESULT,
    get_MaxSamplingInterval: unsafe extern "system" fn(this: *mut c_void, v: *mut i64) -> HRESULT,
    get_MinOutOfRangeTimeout: unsafe extern "system" fn(this: *mut c_void, v: *mut i64) -> HRESULT,
    get_MaxOutOfRangeTimeout: unsafe extern "system" fn(this: *mut c_void, v: *mut i64) -> HRESULT,
    get_Status: unsafe extern "system" fn(this: *mut c_void, v: *mut i32) -> HRESULT,
    get_ScanningMode: unsafe extern "system" fn(this: *mut c_void, v: *mut i32) -> HRESULT,
    put_ScanningMode: unsafe extern "system" fn(this: *mut c_void, v: i32) -> HRESULT,
    get_SignalStrengthFilter: unsafe extern "system" fn(this: *mut c_void, v: *mut *mut c_void) -> HRESULT,
    put_SignalStrengthFilter: unsafe extern "system" fn(this: *mut c_void, v: *mut c_void) -> HRESULT,
    get_AdvertisementFilter: unsafe extern "system" fn(this: *mut c_void, v: *mut *mut c_void) -> HRESULT,
    put_AdvertisementFilter: unsafe extern "system" fn(this: *mut c_void, v: *mut c_void) -> HRESULT,
    Start: unsafe extern "system" fn(this: *mut c_void) -> HRESULT,
    Stop: unsafe extern "system" fn(this: *mut c_void) -> HRESULT,
    add_Received: unsafe extern "system" fn(this: *mut c_void, handler: *mut c_void, token: *mut EventRegistrationToken) -> HRESULT,
    remove_Received: unsafe extern "system" fn(this: *mut c_void, token: EventRegistrationToken) -> HRESULT,
}
impl IWatcher {
    unsafe fn get_Status(&mut self, v: *mut i32) -> HRESULT {
        unsafe { ((*self.vtbl).get_Status)(self as *mut _ as *mut c_void, v) }
    }
    unsafe fn Start(&mut self) -> HRESULT {
        unsafe { ((*self.vtbl).Start)(self as *mut _ as *mut c_void) }
    }
    unsafe fn add_Received(&mut self, handler: *mut c_void, token: *mut EventRegistrationToken) -> HRESULT {
        unsafe { ((*self.vtbl).add_Received)(self as *mut _ as *mut c_void, handler, token) }
    }
}

/// The inherited `p->QueryInterface(iid, (void**)&q)`: vtable slot 0 of every interface.
unsafe fn qi<T>(obj: *mut c_void, iid: *const GUID, out: *mut *mut T) -> HRESULT {
    unsafe {
        let vtbl = *(obj as *mut *const IUnknown_Vtbl);
        ((*vtbl).QueryInterface)(obj, iid, out as *mut *mut c_void)
    }
}

/// The inherited `p->Release()`: vtable slot 2 of every interface. The C++ `Release(p)` template
/// is a no-op on null.
unsafe fn release(p: *mut c_void) -> u32 {
    unsafe {
        if p.is_null() {
            return 0;
        }
        let vtbl = *(p as *mut *const IUnknown_Vtbl);
        ((*vtbl).Release)(p)
    }
}

// ---- received messages -------------------------------------------------------------------------

#[derive(Clone, Copy)]
struct Advert {
    model: u16,
    single: bool,
    leftBroadcasts: bool,
    left: i32,
    right: i32,
    caseLevel: i32, // percent, -1 unknown (single-battery models use `left`; `caseLevel` is the C++ `box`)
    leftChg: bool,
    rightChg: bool,
    caseChg: bool,
    rssi: i32,
    tick: u64,
}
impl Default for Advert {
    fn default() -> Self {
        Advert {
            model: 0,
            single: false,
            leftBroadcasts: false,
            left: -1,
            right: -1,
            caseLevel: -1,
            leftChg: false,
            rightChg: false,
            caseChg: false,
            rssi: -127,
            tick: 0,
        }
    }
}

static G_ADVERTS: Mutex<BTreeMap<u64, Advert>> = Mutex::new(BTreeMap::new()); // by (random, rotating) BLE address

fn Level(nibble: i32) -> i32 {
    if nibble <= 10 { nibble * 10 } else { -1 }
}

// Single-battery headphones and neckbands (AirPods Max, Beats Solo/Studio/X/Flex/Powerbeats) put
// their battery in the low nibble of byte 6 and leave the upper nibble and case nibble as 0 (not
// 15), so decoding them as dual-bud would always report the unused side as 0%.
fn IsSingleBatteryModel(model: u16) -> bool {
    match model {
        0x200A |  // AirPods Max (Lightning)
        0x201F |  // AirPods Max (USB-C)
        0x202D |  // AirPods Max 2
        0x2003 |  // Powerbeats 3
        0x2005 |  // BeatsX
        0x2006 |  // Beats Solo 3
        0x2009 |  // Beats Studio 3
        0x200C |  // Beats Solo Pro
        0x200D |  // Powerbeats 4
        0x2010 |  // Beats Flex
        0x2017 |  // Beats Studio Pro
        0x2025    // Beats Solo 4
        => true,
        _ => false,
    }
}

fn ParseProximityTlv(d: &[u8], a: &mut Advert) -> bool {
    // d[1] == 0x19 (25 bytes following) and d[2] == 0x01 (paired status mode; 0x00 is pairing mode).
    let n = d.len();
    if n < 27 || d[0] != 0x07 || d[1] != 0x19 || d[2] != 0x01 {
        return false;
    }
    a.model = (d[3] as u16) | ((d[4] as u16) << 8);
    if (a.model & 0xFF00) != 0x2000 {
        return false;
    }
    a.single = IsSingleBatteryModel(a.model);
    a.leftBroadcasts = (d[5] & 0x20) != 0;
    let cur = (d[6] & 0x0F) as i32;
    let other = (d[6] >> 4) as i32;
    let chg = (d[7] >> 4) as i32;
    if a.single {
        let mut pct = Level(cur);
        let mut charging = (chg & 0x01) != 0;
        if cur == 0 && other >= 1 && other <= 10 {
            pct = Level(other);
            charging = (chg & 0x02) != 0;
        }
        if pct < 0 {
            return false;
        }
        a.left = pct;
        a.leftChg = charging;
        a.right = -1;
        a.caseLevel = -1;
        return true;
    }
    a.left = Level(if a.leftBroadcasts { cur } else { other });
    a.right = Level(if a.leftBroadcasts { other } else { cur });
    a.leftChg = a.left >= 0 && (chg & if a.leftBroadcasts { 0x01 } else { 0x02 }) != 0;
    a.rightChg = a.right >= 0 && (chg & if a.leftBroadcasts { 0x02 } else { 0x01 }) != 0;
    a.caseLevel = Level((d[7] & 0x0F) as i32);
    a.caseChg = a.caseLevel >= 0 && (chg & 0x04) != 0;
    a.left >= 0 || a.right >= 0 || a.caseLevel >= 0
}

fn Parse(buf: &[u8], a: &mut Advert) -> bool {
    // Walk the Apple Continuity TLV sequence in case another TLV precedes 0x07.
    let n = buf.len() as u32;
    let mut i: u32 = 0;
    while i + 1 < n {
        let ty = buf[i as usize];
        let len = buf[i as usize + 1] as u32;
        if i + 2 + len > n {
            break;
        }
        if ty == 0x07 && ParseProximityTlv(&buf[i as usize..(i + 2 + len) as usize], a) {
            return true;
        }
        i += 2 + len;
    }
    false
}

fn OnReceived(args: *mut IReceivedArgs) {
    unsafe {
        let mut adv: *mut IAdvertisement = std::ptr::null_mut();
        if failed((*args).get_Advertisement(&mut adv)) || adv.is_null() {
            return;
        }
        let mut view: *mut IManufacturerDataView = std::ptr::null_mut();
        if succeeded((*adv).GetManufacturerDataByCompanyId(0x004C, &mut view)) && !view.is_null() {
            let mut count: u32 = 0;
            (*view).get_Size(&mut count);
            for i in 0..count {
                let mut md: *mut IManufacturerData = std::ptr::null_mut();
                let mut buf: *mut IBufferAbi = std::ptr::null_mut();
                let mut bytes: *mut IBufferByteAccessAbi = std::ptr::null_mut();
                let mut p: *mut u8 = std::ptr::null_mut();
                let mut len: u32 = 0;
                let mut a = Advert::default();
                if succeeded((*view).GetAt(i, &mut md))
                    && !md.is_null()
                    && succeeded((*md).get_Data(&mut buf))
                    && !buf.is_null()
                    && succeeded((*buf).get_Length(&mut len))
                    && succeeded(qi(buf as *mut c_void, &IID_BufferByteAccess, &mut bytes))
                    && !bytes.is_null()
                    && succeeded((*bytes).Buffer(&mut p))
                    && !p.is_null()
                    && Parse(std::slice::from_raw_parts(p, len as usize), &mut a)
                {
                    let mut addr: u64 = 0;
                    let mut rssi: i16 = -127;
                    (*args).get_BluetoothAddress(&mut addr);
                    (*args).get_RawSignalStrengthInDBm(&mut rssi);
                    a.rssi = rssi as i32;
                    a.tick = now_ms();
                    let mut g = G_ADVERTS.lock().unwrap();
                    g.insert(addr, a);
                    // addresses rotate: drop old ones
                    g.retain(|_, ad| a.tick.wrapping_sub(ad.tick) <= 10 * 60 * 1000);
                }
                release(bytes as *mut c_void);
                release(buf as *mut c_void);
                release(md as *mut c_void);
            }
        }
        release(view as *mut c_void);
        release(adv as *mut c_void);
    }
}

// Static delegate object: lives as long as the process.
#[repr(C)]
struct ReceivedHandler {
    vtbl: *const ReceivedHandlerVtbl,
}
unsafe impl Send for ReceivedHandler {}
unsafe impl Sync for ReceivedHandler {}

#[repr(C)]
struct ReceivedHandlerVtbl {
    base: IUnknown_Vtbl,
    // ITypedEventHandler<BluetoothLEAdvertisementWatcher, BluetoothLEAdvertisementReceivedEventArgs>
    Invoke: unsafe extern "system" fn(this: *mut c_void, sender: *mut c_void, args: *mut c_void) -> HRESULT,
}

unsafe extern "system" fn handler_QueryInterface(this: *mut c_void, iid: *const GUID, out: *mut *mut c_void) -> HRESULT {
    unsafe {
        if guid_eq(&*iid, &IID_IUnknown) || guid_eq(&*iid, &IID_ReceivedHandler) || guid_eq(&*iid, &IID_Agile) {
            *out = this;
            return S_OK;
        }
        *out = std::ptr::null_mut();
        E_NOINTERFACE
    }
}
unsafe extern "system" fn handler_AddRef(_this: *mut c_void) -> u32 {
    2
}
unsafe extern "system" fn handler_Release(_this: *mut c_void) -> u32 {
    1
}

unsafe extern "system" fn handler_Invoke(_this: *mut c_void, _sender: *mut c_void, argsObj: *mut c_void) -> HRESULT {
    unsafe {
        if !argsObj.is_null() {
            let mut args: *mut IReceivedArgs = std::ptr::null_mut();
            if succeeded(qi(argsObj, &IID_ReceivedArgs, &mut args)) && !args.is_null() {
                OnReceived(args);
                release(args as *mut c_void);
            }
        }
    }
    S_OK
}

static HANDLER_VTBL: ReceivedHandlerVtbl = ReceivedHandlerVtbl {
    base: IUnknown_Vtbl { QueryInterface: handler_QueryInterface, AddRef: handler_AddRef, Release: handler_Release },
    Invoke: handler_Invoke,
};
static G_HANDLER: ReceivedHandler = ReceivedHandler { vtbl: &HANDLER_VTBL };

#[derive(Clone, Copy)]
struct Watcher(*mut IWatcher);
unsafe impl Send for Watcher {}
unsafe impl Sync for Watcher {}

static G_WATCHER: Mutex<Option<Watcher>> = Mutex::new(None);

// Starts (or restarts after the radio was switched off) the watcher. Returns true if it was just started.
fn EnsureWatcher() -> bool {
    let mut guard = G_WATCHER.lock().unwrap();
    if let Some(w) = *guard {
        let mut st: i32 = 0;
        unsafe {
            if succeeded((*w.0).get_Status(&mut st)) && (st == WATCHER_STOPPED || st == WATCHER_ABORTED) {
                return succeeded((*w.0).Start());
            }
        }
        return false;
    }
    unsafe {
        RoInitialize(RO_INIT_MULTITHREADED);
    } // our poll thread; harmless if already initialised
    let cls = to_wide("Windows.Devices.Bluetooth.Advertisement.BluetoothLEAdvertisementWatcher");
    let mut name: HSTRING = std::ptr::null_mut();
    let mut obj: *mut c_void = std::ptr::null_mut();
    if succeeded(unsafe { WindowsCreateString(cls.as_ptr(), (cls.len() - 1) as u32, &mut name) }) {
        unsafe {
            RoActivateInstance(name, &mut obj);
            WindowsDeleteString(name);
        }
    }
    if obj.is_null() {
        return false;
    }
    let mut watcher: *mut IWatcher = std::ptr::null_mut();
    unsafe {
        qi(obj, &IID_Watcher, &mut watcher);
        release(obj);
    }
    if watcher.is_null() {
        return false;
    }
    let mut tok = EventRegistrationToken { value: 0 };
    if failed(unsafe { (*watcher).add_Received(&G_HANDLER as *const ReceivedHandler as *mut c_void, &mut tok) }) {
        unsafe {
            release(watcher as *mut c_void);
        }
        return false;
    }
    *guard = Some(Watcher(watcher));
    succeeded(unsafe { (*watcher).Start() })
}

// BluetoothLEAdvertisementWatcherStatus: Stopped = 3, Aborted = 4.
const WATCHER_STOPPED: i32 = 3;
const WATCHER_ABORTED: i32 = 4;

// ---- paired Apple audio devices ----------------------------------------------------------------

// DEVPKEY_Device_IsConnected ({83da6326-97a6-4088-9453-a1923f573b29}, pid 15)
const K_IS_CONNECTED: DEVPROPKEY = DEVPROPKEY { fmtid: GUID::from_u128(0x83da6326_97a6_4088_9453_a1923f573b29), pid: 15 };

#[derive(Default)]
struct AppleDevice {
    name: String,
    pid: u16, // Apple model id, from the "_VID&0001004C_PID&xxxx" service nodes
    connected: bool,
    apple: bool,
}

fn PairedAppleAudio() -> Vec<AppleDevice> {
    let mut byContainer: BTreeMap<String, AppleDevice> = BTreeMap::new();
    unsafe {
        let di =
            SetupDiGetClassDevsW(std::ptr::null(), to_wide("BTHENUM").as_ptr(), std::ptr::null_mut(), DIGCF_ALLCLASSES | DIGCF_PRESENT);
        if di == -1 {
            return Vec::new();
        } // INVALID_HANDLE_VALUE (HDEVINFO is isize)
        let mut dd: SP_DEVINFO_DATA = std::mem::zeroed();
        dd.cbSize = std::mem::size_of::<SP_DEVINFO_DATA>() as u32;
        let mut i = 0u32;
        while SetupDiEnumDeviceInfo(di, i, &mut dd) != 0 {
            i += 1;
            let mut inst = [0u16; 512];
            if SetupDiGetDeviceInstanceIdW(di, &dd, inst.as_mut_ptr(), 512, std::ptr::null_mut()) == 0 {
                continue;
            }
            let inst_s = wide_to_string(&inst);
            let mut container: GUID = std::mem::zeroed();
            let mut t: u32 = 0;
            if SetupDiGetDevicePropertyW(
                di,
                &dd,
                &DEVPKEY_Device_ContainerId,
                &mut t,
                &mut container as *mut GUID as *mut u8,
                std::mem::size_of::<GUID>() as u32,
                std::ptr::null_mut(),
                0,
            ) == 0
            {
                continue;
            }
            let mut g = [0u16; 64];
            StringFromGUID2(&container, g.as_mut_ptr(), 64);
            let d = byContainer.entry(wide_to_string(&g)).or_default();
            let id = inst_s.to_uppercase();
            if let Some(v) = id.find("_VID&0001004C") {
                d.apple = true;
                if let Some(p) = id[v..].find("_PID&").map(|p| p + v) {
                    // wcstoul(id + p + 5, nullptr, 16): parse hex digits until the next '&'
                    let hex: String = id[p + 5..].chars().take_while(|c| c.is_ascii_hexdigit()).collect();
                    d.pid = u64::from_str_radix(&hex, 16).unwrap_or(0) as u16;
                }
            }
            if inst_s.starts_with("BTHENUM\\DEV_") {
                let mut name = [0u16; 256];
                if SetupDiGetDevicePropertyW(
                    di,
                    &dd,
                    &DEVPKEY_Device_FriendlyName,
                    &mut t,
                    name.as_mut_ptr() as *mut u8,
                    ((name.len() - 1) * 2) as u32,
                    std::ptr::null_mut(),
                    0,
                ) != 0
                {
                    d.name = wide_to_string(&name);
                }
                let mut conn: u8 = 0; // DEVPROP_BOOLEAN
                if SetupDiGetDevicePropertyW(di, &dd, &K_IS_CONNECTED, &mut t, &mut conn, 1, std::ptr::null_mut(), 0) != 0
                    && t == DEVPROP_TYPE_BOOLEAN
                {
                    d.connected = conn != 0; // conn != DEVPROP_FALSE
                }
            }
        }
        SetupDiDestroyDeviceInfoList(di);
    }
    let mut out: Vec<AppleDevice> = Vec::new();
    for d in byContainer.into_values() {
        let n = d.name.to_uppercase();
        let looksApple = n.contains("AIRPODS") || n.contains("BEATS");
        // Apple audio model ids are 0x20xx (0x200A AirPods Max, 0x2014 AirPods Pro 2, 0x2027
        // AirPods Pro 3); iPhones, iPads and Macs are not. Paired devices with a known 0x20xx PID
        // are kept even when Classic Bluetooth is disconnected so headsets charging on the desk
        // can still report via BLE.
        let appleAudio = d.apple && (d.pid & 0xFF00) == 0x2000;
        if appleAudio || (d.connected && looksApple && d.pid == 0) {
            out.push(d);
        }
    }
    // std::sort: connected devices first (Rust's stable sort keeps the container-id order).
    out.sort_by(|a, b| b.connected.cmp(&a.connected));
    out
}

// Best message for one device: the model must match when the PID is known; the strongest signal
// among the last 90 s wins (or the latest one within 5 min when Classic Bluetooth is connected).
// When one bud is in the ear and the other is in the open case, both buds broadcast separately,
// so any missing side/case reading is filled from the latest recent broadcast of the other bud.
fn Pick(dev: &AppleDevice, best: &mut Advert) -> bool {
    let now = now_ms();
    let maxAge: u64 = if dev.connected { 5 * 60 * 1000 } else { 90 * 1000 };
    let minRssi: i32 = if dev.connected { -90 } else { -80 };
    let mut found = false;
    let g = G_ADVERTS.lock().unwrap();
    for a in g.values() {
        if dev.pid != 0 && a.model != dev.pid {
            continue;
        }
        let age = now.wrapping_sub(a.tick); // ULONGLONG arithmetic in the C++
        if age > maxAge || a.rssi < minRssi {
            continue;
        }
        let fresh = age < 90 * 1000;
        let bestFresh = found && now.wrapping_sub(best.tick) < 90 * 1000;
        if !found || (fresh && !bestFresh) || (fresh && bestFresh && a.rssi > best.rssi) || (!fresh && !bestFresh && a.tick > best.tick) {
            *best = *a;
            found = true;
        }
    }
    if found && !best.single {
        for a in g.values() {
            if a.model != best.model || a.single {
                continue;
            }
            if if best.tick > a.tick { best.tick - a.tick > 15 * 1000 } else { a.tick - best.tick > 15 * 1000 } {
                continue;
            }
            if best.left < 0 && a.left >= 0 {
                best.left = a.left;
                best.leftChg = a.leftChg;
            }
            if best.right < 0 && a.right >= 0 {
                best.right = a.right;
                best.rightChg = a.rightChg;
            }
            if best.caseLevel < 0 && a.caseLevel >= 0 {
                best.caseLevel = a.caseLevel;
                best.caseChg = a.caseChg;
            }
        }
    }
    found
}

fn Pct(v: i32) -> String {
    if v < 0 { "?".into() } else { format!("{v}%") }
}

pub fn poll_airpods(ctx: &mut PollContext) {
    let devices = PairedAppleAudio();
    if devices.is_empty() {
        return;
    }
    if EnsureWatcher() {
        // Just started: give the headphones a moment to broadcast (about once every 1-2 s).
        for _ in 0..15 {
            let mut a = Advert::default();
            let mut any = false;
            for d in &devices {
                any |= Pick(d, &mut a);
            }
            if any {
                break;
            }
            sleep_ms(200);
        }
    }
    let mut usedPid: BTreeSet<u16> = BTreeSet::new();
    for d in &devices {
        if d.pid != 0 && !d.connected && usedPid.contains(&d.pid) {
            continue;
        }
        let mut a = Advert::default();
        if !Pick(d, &mut a) {
            continue;
        }
        if d.pid != 0 {
            usedPid.insert(d.pid);
        }
        let mut s = DeviceStatus::default();
        s.name = if d.name.is_empty() { "AirPods".into() } else { d.name.clone() };
        s.key = format!("airpods:{}:{}", hex4(d.pid), s.name);
        s.kind = DeviceKind::Headset;
        if a.single {
            s.percent = a.left;
            s.charging = a.leftChg;
            s.via = "Bluetooth".into();
        } else {
            // Prefer the lower discharging bud (the one in use); only show charging when every
            // online bud is charging.
            let mut disLo: i32 = -1;
            let mut chgLo: i32 = -1;
            if a.left >= 0 {
                let dst: &mut i32 = if a.leftChg { &mut chgLo } else { &mut disLo };
                if *dst < 0 || a.left < *dst {
                    *dst = a.left;
                }
            }
            if a.right >= 0 {
                let dst: &mut i32 = if a.rightChg { &mut chgLo } else { &mut disLo };
                if *dst < 0 || a.right < *dst {
                    *dst = a.right;
                }
            }
            if disLo >= 0 {
                s.percent = disLo;
                s.charging = false;
            } else if chgLo >= 0 {
                s.percent = chgLo;
                s.charging = true;
            } else {
                s.percent = a.caseLevel;
                s.charging = a.caseChg;
            }
            let bolt = |on: bool| if on { "\u{26A1}" } else { "" };
            s.via = format!(
                "Bluetooth \u{00B7} L {}{}  R {}{}  case {}{}",
                Pct(a.left),
                bolt(a.leftChg),
                Pct(a.right),
                bolt(a.rightChg),
                Pct(a.caseLevel),
                bolt(a.caseChg)
            );
        }
        s.grace_sec = if d.connected { 300 } else { 0 };
        ctx.out.push(s);
    }
}
