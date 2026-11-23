//! Thin Win32 HID layer shared by all drivers (hid.h / hid.cpp).
//!
//! Report buffers follow hidapi conventions so protocol code from other projects maps 1:1:
//!  * write/set_feature: data[0] is the report ID (0 when the device does not number its reports);
//!    the buffer is zero-padded to the report length.
//!  * read: a leading 0 report ID is stripped, so data[0] is the first payload byte for
//!    unnumbered reports and the report ID for numbered ones.
//!
//! `HidIo`/`HidFactory` exist so the vendor drivers can be exercised from unit tests with a
//! scripted transport (the Rust equivalent of the C++ tests linking their own `HidDev`).

use std::collections::BTreeSet;

use windows_sys::Win32::Devices::DeviceAndDriverInstallation::{
    DIGCF_DEVICEINTERFACE, DIGCF_PRESENT, SP_DEVICE_INTERFACE_DATA, SP_DEVICE_INTERFACE_DETAIL_DATA_W, SetupDiDestroyDeviceInfoList,
    SetupDiEnumDeviceInterfaces, SetupDiGetClassDevsW, SetupDiGetDeviceInterfaceDetailW,
};
use windows_sys::Win32::Devices::HumanInterfaceDevice::{
    HIDD_ATTRIBUTES, HIDP_CAPS, HidD_FlushQueue, HidD_FreePreparsedData, HidD_GetAttributes, HidD_GetFeature, HidD_GetHidGuid,
    HidD_GetInputReport, HidD_GetPreparsedData, HidD_GetProductString, HidD_SetFeature, HidD_SetOutputReport, HidP_GetCaps,
};
use windows_sys::Win32::Foundation::{CloseHandle, WAIT_OBJECT_0};
use windows_sys::Win32::Foundation::{ERROR_IO_PENDING, GENERIC_READ, GENERIC_WRITE, HANDLE, INVALID_HANDLE_VALUE};
use windows_sys::Win32::Storage::FileSystem::{
    CreateFileW, FILE_FLAG_OVERLAPPED, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING, ReadFile, WriteFile,
};
use windows_sys::Win32::System::IO::{CancelIo, GetOverlappedResult, OVERLAPPED};
use windows_sys::Win32::System::Threading::{CreateEventW, WaitForSingleObject};

use crate::devices::{DeviceKind, DeviceStatus};
use crate::win::{to_wide, wide_to_string};

// ---- collections ------------------------------------------------------------------------------

/// The HIDP_CAPS fields the drivers actually use.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct HidCaps {
    pub usage_page: u16,
    pub usage: u16,
    pub input_report_byte_length: u16,
    pub output_report_byte_length: u16,
    pub feature_report_byte_length: u16,
}

/// One HID top-level collection.
#[derive(Clone, Debug, Default)]
pub struct HidColl {
    pub path: String, // device interface path (ASCII in practice; converted back to wide on open)
    /// Unused on Windows, kept for parity with the C++ struct.
    #[allow(dead_code)]
    pub product: String,
    pub vid: u16,
    pub pid: u16,
    pub iface: i32, // USB interface number (MI_xx in the path), -1 when unknown
    pub caps: HidCaps,
}

impl HidColl {
    pub fn page(&self) -> u16 {
        self.caps.usage_page
    }
    pub fn usage(&self) -> u16 {
        self.caps.usage
    }
    pub fn in_len(&self) -> u16 {
        self.caps.input_report_byte_length
    }
    pub fn out_len(&self) -> u16 {
        self.caps.output_report_byte_length
    }
    pub fn feat_len(&self) -> u16 {
        self.caps.feature_report_byte_length
    }
}

/// Enumerates every present HID collection.
pub fn enum_hid() -> Vec<HidColl> {
    let mut out = Vec::new();
    unsafe {
        let mut hid_guid = std::mem::zeroed();
        HidD_GetHidGuid(&mut hid_guid);
        let di = SetupDiGetClassDevsW(&hid_guid, std::ptr::null(), std::ptr::null_mut(), DIGCF_PRESENT | DIGCF_DEVICEINTERFACE);
        if di == -1 {
            return out;
        } // INVALID_HANDLE_VALUE (HDEVINFO is isize)
        let mut ifd: SP_DEVICE_INTERFACE_DATA = std::mem::zeroed();
        ifd.cbSize = std::mem::size_of::<SP_DEVICE_INTERFACE_DATA>() as u32;
        let mut i = 0u32;
        while SetupDiEnumDeviceInterfaces(di, std::ptr::null(), &hid_guid, i, &mut ifd) != 0 {
            i += 1;
            let mut need = 0u32;
            SetupDiGetDeviceInterfaceDetailW(di, &ifd, std::ptr::null_mut(), 0, &mut need, std::ptr::null_mut());
            if need == 0 {
                continue;
            }
            let mut buf = vec![0u8; need as usize];
            let det = buf.as_mut_ptr() as *mut SP_DEVICE_INTERFACE_DETAIL_DATA_W;
            (*det).cbSize = std::mem::size_of::<SP_DEVICE_INTERFACE_DETAIL_DATA_W>() as u32;
            if SetupDiGetDeviceInterfaceDetailW(di, &ifd, det, need, std::ptr::null_mut(), std::ptr::null_mut()) == 0 {
                continue;
            }
            let path_ptr: *const u16 = (*det).DevicePath.as_ptr();
            let mut path_len = 0usize;
            while *path_ptr.add(path_len) != 0 {
                path_len += 1;
            }
            let path = wide_to_string(std::slice::from_raw_parts(path_ptr, path_len));
            let wide_path = to_wide(&path);
            let h = CreateFileW(
                wide_path.as_ptr(),
                0,
                FILE_SHARE_READ | FILE_SHARE_WRITE,
                std::ptr::null(),
                OPEN_EXISTING,
                0,
                std::ptr::null_mut(),
            );
            if h == INVALID_HANDLE_VALUE {
                continue;
            }
            let mut c = HidColl { path, ..Default::default() };
            let mut a: HIDD_ATTRIBUTES = std::mem::zeroed();
            a.Size = std::mem::size_of::<HIDD_ATTRIBUTES>() as u32;
            if HidD_GetAttributes(h, &mut a) {
                c.vid = a.VendorID;
                c.pid = a.ProductID;
            }
            let mut pp: isize = 0;
            if HidD_GetPreparsedData(h, &mut pp) {
                let mut caps: HIDP_CAPS = std::mem::zeroed();
                if HidP_GetCaps(pp, &mut caps) != 0 {
                    c.caps = HidCaps {
                        usage_page: caps.UsagePage,
                        usage: caps.Usage,
                        input_report_byte_length: caps.InputReportByteLength,
                        output_report_byte_length: caps.OutputReportByteLength,
                        feature_report_byte_length: caps.FeatureReportByteLength,
                    };
                }
                HidD_FreePreparsedData(pp);
            }
            CloseHandle(h);
            // USB interface number from the MI_xx part of the path.
            let lower = c.path.to_lowercase();
            if let Some(mi) = lower.find("&mi_") {
                let take: String = lower[mi + 4..].chars().take_while(|ch| ch.is_ascii_hexdigit()).collect();
                c.iface = i32::from_str_radix(&take, 16).unwrap_or(-1);
            }
            out.push(c);
        }
        SetupDiDestroyDeviceInfoList(di);
    }
    out
}

// ---- the testable transport seam ---------------------------------------------------------------

/// A handle to one open HID collection. Mirrors C++ `HidDev`.
///
/// `write`/`set_feature` zero-pad `data` to the report length (data[0] is the report ID);
/// `read`/`set_output_and_read` return the byte count, or -1 on timeout/error, and write the
/// report payload (leading 0 report ID stripped) into `buf`.
pub trait HidIo {
    fn write(&mut self, data: &[u8], timeout_ms: u32) -> bool;
    fn read(&mut self, buf: &mut Vec<u8>, timeout_ms: u32) -> i32;
    fn set_output_and_read(&mut self, data: &[u8], buf: &mut Vec<u8>, timeout_ms: u32) -> i32;
    fn flush(&mut self);
    fn set_feature(&mut self, data: &[u8]) -> bool;
    fn get_feature(&mut self, report_id: u8, out: &mut Vec<u8>) -> bool;
    fn get_input_report(&mut self, report_id: u8, out: &mut Vec<u8>) -> bool;
}

/// Opens collections (C++ `HidDev::Open*`).
pub trait HidFactory {
    /// Read/write, overlapped.
    fn open(&mut self, coll: &HidColl) -> Option<Box<dyn HidIo>>;
    /// Read only, overlapped: for push-only collections another app may hold.
    fn open_read_only(&mut self, coll: &HidColl) -> Option<Box<dyn HidIo>>;
    /// Zero access: enough for feature reports, works on mice/keyboards.
    fn open_feature_only(&mut self, coll: &HidColl) -> Option<Box<dyn HidIo>>;
}

/// Drivers may pass `&mut Box<dyn HidIo>` (or generics) around; forward through the box.
impl HidIo for Box<dyn HidIo> {
    fn write(&mut self, data: &[u8], timeout_ms: u32) -> bool {
        (**self).write(data, timeout_ms)
    }
    fn read(&mut self, buf: &mut Vec<u8>, timeout_ms: u32) -> i32 {
        (**self).read(buf, timeout_ms)
    }
    fn set_output_and_read(&mut self, data: &[u8], buf: &mut Vec<u8>, timeout_ms: u32) -> i32 {
        (**self).set_output_and_read(data, buf, timeout_ms)
    }
    fn flush(&mut self) {
        (**self).flush()
    }
    fn set_feature(&mut self, data: &[u8]) -> bool {
        (**self).set_feature(data)
    }
    fn get_feature(&mut self, report_id: u8, out: &mut Vec<u8>) -> bool {
        (**self).get_feature(report_id, out)
    }
    fn get_input_report(&mut self, report_id: u8, out: &mut Vec<u8>) -> bool {
        (**self).get_input_report(report_id, out)
    }
}

// ---- the poll context --------------------------------------------------------------------------

/// State threaded through every driver poll (drivers.h `PollContext`).
pub struct PollContext<'io> {
    pub colls: Vec<HidColl>,
    /// (vid, pid) pairs claimed by a driver, so the generic fallbacks do not report twice.
    pub claimed: BTreeSet<(u16, u16)>,
    /// Container ids poll_bluetooth already reported (GUID strings).
    pub bt_containers: BTreeSet<String>,
    pub out: Vec<DeviceStatus>,
    pub io: &'io mut dyn HidFactory,
}

impl<'io> PollContext<'io> {
    pub fn new(io: &'io mut dyn HidFactory) -> Self {
        Self { colls: Vec::new(), claimed: BTreeSet::new(), bt_containers: BTreeSet::new(), out: Vec::new(), io }
    }

    pub fn is_claimed(&self, vid: u16, pid: u16) -> bool {
        self.claimed.contains(&(vid, pid))
    }
    pub fn claim(&mut self, vid: u16, pid: u16) {
        self.claimed.insert((vid, pid));
    }
    pub fn add(&mut self, s: DeviceStatus, vid: u16, pid: u16) {
        self.out.push(s);
        self.claim(vid, pid);
    }
    /// Distinct (vid, pid) pairs for a vendor that are not claimed yet, sorted.
    pub fn products(&self, vid: u16) -> Vec<(u16, u16)> {
        let mut s = BTreeSet::new();
        for c in &self.colls {
            if c.vid == vid && !self.is_claimed(c.vid, c.pid) {
                s.insert((c.vid, c.pid));
            }
        }
        s.into_iter().collect()
    }
    /// Collections of one product (cloned, so `&mut self` stays usable while iterating).
    pub fn find(&self, vid: u16, pid: u16, pred: impl Fn(&HidColl) -> bool) -> Vec<HidColl> {
        self.colls.iter().filter(|c| c.vid == vid && c.pid == pid && pred(c)).cloned().collect()
    }

    pub fn open(&mut self, coll: &HidColl) -> Option<Box<dyn HidIo>> {
        self.io.open(coll)
    }
    pub fn open_read_only(&mut self, coll: &HidColl) -> Option<Box<dyn HidIo>> {
        self.io.open_read_only(coll)
    }
    pub fn open_feature_only(&mut self, coll: &HidColl) -> Option<Box<dyn HidIo>> {
        self.io.open_feature_only(coll)
    }
}

// ---- the Win32 transport ------------------------------------------------------------------------

struct WinHidDev {
    h: HANDLE,
    overlapped: bool,
    coll: HidColl,
}

impl Drop for WinHidDev {
    fn drop(&mut self) {
        if self.h != INVALID_HANDLE_VALUE {
            unsafe {
                CloseHandle(self.h);
            }
        }
    }
}

impl WinHidDev {
    fn open(coll: &HidColl, access: u32, flags: u32) -> Option<WinHidDev> {
        let wide = to_wide(&coll.path);
        let h = unsafe {
            CreateFileW(
                wide.as_ptr(),
                access,
                FILE_SHARE_READ | FILE_SHARE_WRITE,
                std::ptr::null(),
                OPEN_EXISTING,
                flags,
                std::ptr::null_mut(),
            )
        };
        if h == INVALID_HANDLE_VALUE {
            return None;
        }
        Some(WinHidDev { h, overlapped: flags != 0, coll: coll.clone() })
    }

    /// Runs one overlapped file operation with a timeout; returns the transferred byte count.
    fn overlapped_op(&mut self, write: bool, buf: &[u8], timeout_ms: u32) -> Option<u32> {
        unsafe {
            let mut ov: OVERLAPPED = std::mem::zeroed();
            ov.hEvent = CreateEventW(std::ptr::null(), 1, 0, std::ptr::null());
            let mut got: u32 = 0;
            let pending = if write {
                WriteFile(self.h, buf.as_ptr() as *const _, buf.len() as u32, std::ptr::null_mut(), &mut ov) != 0
            } else {
                ReadFile(self.h, buf.as_ptr() as *mut _, buf.len() as u32, std::ptr::null_mut(), &mut ov) != 0
            };
            let io_pending = !pending && windows_sys::Win32::Foundation::GetLastError() == ERROR_IO_PENDING;
            let mut done = false;
            if pending || io_pending {
                if WaitForSingleObject(ov.hEvent, timeout_ms) == WAIT_OBJECT_0 {
                    done = GetOverlappedResult(self.h, &mut ov, &mut got, 0) != 0;
                } else {
                    CancelIo(self.h);
                    done = GetOverlappedResult(self.h, &mut ov, &mut got, 1) != 0;
                }
            }
            CloseHandle(ov.hEvent);
            if done { Some(got) } else { None }
        }
    }
}

/// Production HID factory backed by Win32.
pub struct WinHidFactory;

impl HidFactory for WinHidFactory {
    fn open(&mut self, coll: &HidColl) -> Option<Box<dyn HidIo>> {
        WinHidDev::open(coll, GENERIC_READ | GENERIC_WRITE, FILE_FLAG_OVERLAPPED).map(|d| Box::new(d) as Box<dyn HidIo>)
    }
    fn open_read_only(&mut self, coll: &HidColl) -> Option<Box<dyn HidIo>> {
        WinHidDev::open(coll, GENERIC_READ, FILE_FLAG_OVERLAPPED).map(|d| Box::new(d) as Box<dyn HidIo>)
    }
    fn open_feature_only(&mut self, coll: &HidColl) -> Option<Box<dyn HidIo>> {
        WinHidDev::open(coll, 0, 0).map(|d| Box::new(d) as Box<dyn HidIo>)
    }
}

impl HidIo for WinHidDev {
    fn write(&mut self, data: &[u8], timeout_ms: u32) -> bool {
        if !self.overlapped || self.coll.out_len() == 0 || data.is_empty() {
            return false;
        }
        let mut buf = vec![0u8; self.coll.out_len() as usize];
        let n = buf.len().min(data.len());
        buf[..n].copy_from_slice(&data[..n]);
        self.overlapped_op(true, &buf, timeout_ms).is_some()
    }

    fn read(&mut self, buf: &mut Vec<u8>, timeout_ms: u32) -> i32 {
        if !self.overlapped || self.coll.in_len() == 0 {
            return -1;
        }
        let tmp = vec![0u8; self.coll.in_len() as usize];
        let Some(got) = self.overlapped_op(false, &tmp, timeout_ms) else { return -1 };
        if got == 0 {
            return -1;
        }
        let off = if tmp[0] == 0 { 1 } else { 0 }; // hidapi semantics: drop the "no report ID" byte
        buf.clear();
        buf.extend_from_slice(&tmp[off..got as usize]);
        buf.len() as i32
    }

    fn set_output_and_read(&mut self, data: &[u8], buf: &mut Vec<u8>, timeout_ms: u32) -> i32 {
        if !self.overlapped || self.coll.in_len() == 0 || self.coll.out_len() == 0 || data.is_empty() {
            return -1;
        }
        let mut out = vec![0u8; self.coll.out_len() as usize];
        let n = out.len().min(data.len());
        out[..n].copy_from_slice(&data[..n]);
        unsafe {
            let tmp = vec![0u8; self.coll.in_len() as usize];
            let mut ov: OVERLAPPED = std::mem::zeroed();
            ov.hEvent = CreateEventW(std::ptr::null(), 1, 0, std::ptr::null());
            let mut got: u32 = 0;
            let pending = ReadFile(self.h, tmp.as_ptr() as *mut _, tmp.len() as u32, std::ptr::null_mut(), &mut ov) != 0;
            let io_pending = !pending && windows_sys::Win32::Foundation::GetLastError() == ERROR_IO_PENDING;
            let mut done = false;
            if pending || io_pending {
                let sent = HidD_SetOutputReport(self.h, out.as_ptr() as *const _, out.len() as u32);
                if sent && timeout_ms > 0 && WaitForSingleObject(ov.hEvent, timeout_ms) == WAIT_OBJECT_0 {
                    done = GetOverlappedResult(self.h, &mut ov, &mut got, 0) != 0;
                } else {
                    CancelIo(self.h);
                    done = GetOverlappedResult(self.h, &mut ov, &mut got, 1) != 0 && sent;
                }
            }
            CloseHandle(ov.hEvent);
            if !done || got == 0 {
                return -1;
            }
            let off = if tmp[0] == 0 { 1 } else { 0 };
            buf.clear();
            buf.extend_from_slice(&tmp[off..got as usize]);
            buf.len() as i32
        }
    }

    fn flush(&mut self) {
        unsafe {
            HidD_FlushQueue(self.h);
        }
    }

    fn set_feature(&mut self, data: &[u8]) -> bool {
        if self.coll.feat_len() == 0 {
            return false;
        }
        let mut buf = vec![0u8; self.coll.feat_len() as usize];
        let n = buf.len().min(data.len());
        buf[..n].copy_from_slice(&data[..n]);
        unsafe { HidD_SetFeature(self.h, buf.as_ptr() as *const _, buf.len() as u32) }
    }

    fn get_feature(&mut self, report_id: u8, out: &mut Vec<u8>) -> bool {
        if self.coll.feat_len() == 0 {
            return false;
        }
        out.clear();
        out.resize(self.coll.feat_len() as usize, 0);
        out[0] = report_id;
        unsafe { HidD_GetFeature(self.h, out.as_mut_ptr() as *mut _, out.len() as u32) }
    }

    fn get_input_report(&mut self, report_id: u8, out: &mut Vec<u8>) -> bool {
        if self.coll.in_len() == 0 {
            return false;
        }
        out.clear();
        out.resize(self.coll.in_len() as usize, 0);
        out[0] = report_id;
        unsafe { HidD_GetInputReport(self.h, out.as_mut_ptr() as *mut _, out.len() as u32) }
    }
}

// ---- helpers ------------------------------------------------------------------------------------

/// The device's own product string (zero-access open, so it works while another app holds it).
///
/// The C++ tests replaced `HidProduct` at link time; Rust has no link-time substitution, so tests
/// that need a product string use [`test_seam::with_product`] instead (per thread, no effect on
/// release builds).
pub fn hid_product(c: &HidColl) -> String {
    #[cfg(any(test, feature = "test-mock"))]
    if let Some(name) = test_seam::override_for(c) {
        return name;
    }
    hid_product_live(c)
}

fn hid_product_live(c: &HidColl) -> String {
    let wide = to_wide(&c.path);
    let h = unsafe {
        CreateFileW(wide.as_ptr(), 0, FILE_SHARE_READ | FILE_SHARE_WRITE, std::ptr::null(), OPEN_EXISTING, 0, std::ptr::null_mut())
    };
    if h == INVALID_HANDLE_VALUE {
        return String::new();
    }
    let mut name = [0u16; 128];
    unsafe {
        if !HidD_GetProductString(h, name.as_mut_ptr() as *mut _, ((name.len() - 1) * 2) as u32) {
            name[0] = 0;
        }
        CloseHandle(h);
    }
    let end = name.iter().position(|&c| c == 0).unwrap_or(name.len());
    let mut s = wide_to_string(&name[..end]);
    while s.ends_with(|ch: char| ch.is_whitespace()) {
        s.pop();
    }
    s
}

/// Test-only stand-in for the C++ tests' link-time `HidProduct` override.
#[cfg(any(test, feature = "test-mock"))]
pub mod test_seam {
    use super::HidColl;
    use std::cell::RefCell;

    thread_local! {
        // Thread-local because cargo runs every #[test] on its own thread: parallel tests never
        // see each other's product strings.
        static PRODUCT: RefCell<Option<String>> = const { RefCell::new(None) };
    }

    pub(super) fn override_for(_c: &HidColl) -> Option<String> {
        PRODUCT.with(|p| p.borrow().clone())
    }

    /// Runs `f` with `hid_product()` returning `name`, restoring the previous value afterwards.
    ///
    /// ```ignore
    /// with_product("L7 Mix", || poll_machenike(&mut ctx));
    /// ```
    pub fn with_product<R>(name: &str, f: impl FnOnce() -> R) -> R {
        let prev = PRODUCT.with(|p| p.replace(Some(name.to_string())));
        let out = f();
        PRODUCT.with(|p| *p.borrow_mut() = prev);
        out
    }
}

/// "046D" — uppercase 4-digit hex.
pub fn hex4(v: u16) -> String {
    format!("{v:04X}")
}

pub fn clamp100(v: i32) -> i32 {
    v.clamp(0, 100)
}

/// Linear map lo..hi -> 0..100, clamped.
pub fn map_to_100(v: i32, lo: i32, hi: i32) -> i32 {
    if hi <= lo {
        return clamp100(v);
    }
    clamp100((v - lo) * 100 / (hi - lo))
}

/// Piecewise-linear interpolation through (mv_table[i], pct_table[i]); tables sorted by
/// descending voltage.
pub fn interpolate(mv: i32, mv_table: &[i32], pct_table: &[i32]) -> i32 {
    let n = mv_table.len().min(pct_table.len());
    if n == 0 {
        return 0;
    }
    if mv >= mv_table[0] {
        return pct_table[0];
    }
    for i in 1..n {
        if mv >= mv_table[i] {
            let span = mv_table[i - 1] - mv_table[i];
            return pct_table[i] + (pct_table[i - 1] - pct_table[i]) * (mv - mv_table[i]) / (if span != 0 { span } else { 1 });
        }
    }
    pct_table[n - 1]
}

/// Device type from the product name.
pub fn guess_kind(name: &str) -> DeviceKind {
    let n = name.to_lowercase();
    let has = |s: &str| n.contains(s);
    if has("mouse") || has("mice") || has("trackball") {
        return DeviceKind::Mouse;
    }
    if has("keyboard") || has("keys") {
        return DeviceKind::Keyboard;
    }
    if has("controller") || has("gamepad") || has("xbox") || has("dualsense") || has("dualshock") || has("joy-con") {
        return DeviceKind::Gamepad;
    }
    if has("head")
        || has("buds")
        || has("pods")
        || has("ear")
        || has("wh-")
        || has("wf-")
        || has("audio")
        || has("speaker")
        || has("arctis")
        || has("cloud")
        || has("void")
        || has("virtuoso")
    {
        return DeviceKind::Headset;
    }
    DeviceKind::Other
}

/// Device type from the top-level collections a device exposes (mouse > gamepad > keyboard).
pub fn kind_from_collections(all: &[HidColl], vid: u16, pid: u16) -> DeviceKind {
    let mut mouse = false;
    let mut pad = false;
    let mut kbd = false;
    for c in all {
        if c.vid != vid || c.pid != pid || c.page() != 0x01 {
            continue;
        }
        mouse |= c.usage() == 0x02;
        pad |= c.usage() == 0x04 || c.usage() == 0x05;
        kbd |= c.usage() == 0x06;
    }
    if mouse {
        DeviceKind::Mouse
    } else if pad {
        DeviceKind::Gamepad
    } else if kbd {
        DeviceKind::Keyboard
    } else {
        DeviceKind::Other
    }
}

// ---- scripted transport for unit tests -----------------------------------------------------------

/// Scripted transport: the Rust equivalent of the C++ tests providing their own `HidDev`.
/// Build one with the builder methods, hand it to `PollContext::new`, poll, then inspect.
///
/// Note: like the C++ tests, the mock receives exactly the bytes the driver passes — the
/// zero-padding to the report length happens inside the real transport, not here.
#[cfg(any(test, feature = "test-mock"))]
pub mod mock {
    use super::*;
    use std::cell::RefCell;
    use std::collections::{HashMap, VecDeque};
    use std::rc::Rc;

    #[derive(Default)]
    pub struct MockState {
        pub opens: u32,
        pub open_ok: bool,                           // false: open() reports failure
        pub write_ok: bool,                          // default true is applied by MockFactory::new
        pub writes: Vec<Vec<u8>>,                    // every write()/set_feature() payload, in order
        pub expect_writes: Vec<Vec<u8>>,             // when non-empty, each write must match the next entry
        pub reads: VecDeque<Vec<u8>>,                // popped by read() / set_output_and_read()
        pub script: HashMap<(u8, u8), Vec<Vec<u8>>>, // on write: queue reports for (data[0], data[1])
        pub feature_reads: VecDeque<Vec<u8>>,        // popped by get_feature(); empty -> false
        pub open_colls: Vec<HidColl>,                // the collections open() was called with
    }

    struct MockHid {
        sh: Rc<RefCell<MockState>>,
        #[allow(dead_code)]
        coll: HidColl,
    }

    impl HidIo for MockHid {
        fn write(&mut self, data: &[u8], _timeout_ms: u32) -> bool {
            let mut sh = self.sh.borrow_mut();
            if !sh.expect_writes.is_empty() {
                let want = sh.expect_writes.remove(0);
                assert_eq!(data, want.as_slice(), "unexpected HID write");
            }
            sh.writes.push(data.to_vec());
            if let Some(extra) = sh.script.get(&key_of(data)).cloned() {
                for r in extra {
                    sh.reads.push_back(r);
                }
            }
            sh.write_ok
        }
        fn read(&mut self, buf: &mut Vec<u8>, _timeout_ms: u32) -> i32 {
            let mut sh = self.sh.borrow_mut();
            match sh.reads.pop_front() {
                Some(r) => {
                    buf.clear();
                    buf.extend_from_slice(&r);
                    buf.len() as i32
                }
                None => -1,
            }
        }
        fn set_output_and_read(&mut self, data: &[u8], buf: &mut Vec<u8>, _timeout_ms: u32) -> i32 {
            self.write(data, 0);
            self.read(buf, 0)
        }
        fn flush(&mut self) {}
        fn set_feature(&mut self, data: &[u8]) -> bool {
            let mut sh = self.sh.borrow_mut();
            if !sh.expect_writes.is_empty() {
                let want = sh.expect_writes.remove(0);
                assert_eq!(data, want.as_slice(), "unexpected HID set_feature");
            }
            sh.writes.push(data.to_vec());
            sh.write_ok
        }
        fn get_feature(&mut self, _report_id: u8, out: &mut Vec<u8>) -> bool {
            let mut sh = self.sh.borrow_mut();
            match sh.feature_reads.pop_front() {
                Some(r) => {
                    out.clear();
                    out.extend_from_slice(&r);
                    true
                }
                None => false,
            }
        }
        fn get_input_report(&mut self, _report_id: u8, _out: &mut Vec<u8>) -> bool {
            false
        }
    }

    fn key_of(data: &[u8]) -> (u8, u8) {
        (data.first().copied().unwrap_or(0), data.get(1).copied().unwrap_or(0))
    }

    /// Builder-style factory; every device it opens shares one state.
    ///
    /// The handle is cheap to clone and clones share the same state, so a test can keep one
    /// handle for assertions while a `PollContext` borrows another:
    /// `let probe = io.clone(); let mut ctx = test_ctx(coll, &mut io); ...; probe.opens()`.
    #[derive(Clone)]
    pub struct MockFactory {
        sh: Rc<RefCell<MockState>>,
    }

    impl MockFactory {
        pub fn new() -> MockFactory {
            MockFactory { sh: Rc::new(RefCell::new(MockState { open_ok: true, write_ok: true, ..Default::default() })) }
        }
        /// Queued replies for read(), in order (already in the shape the driver sees: leading
        /// 0 report id stripped by the real transport, so supply the payload as the C++ tests do).
        pub fn with_reads(self, reads: Vec<Vec<u8>>) -> Self {
            self.sh.borrow_mut().reads = reads.into();
            self
        }
        /// Reports the (scripted) dongle sends after the given (cmd, sub) is written.
        pub fn with_script(self, script: HashMap<(u8, u8), Vec<Vec<u8>>>) -> Self {
            self.sh.borrow_mut().script = script;
            self
        }
        /// Replies for get_feature(), in order (report id byte included).
        pub fn with_feature_reads(self, reads: Vec<Vec<u8>>) -> Self {
            self.sh.borrow_mut().feature_reads = reads.into();
            self
        }
        /// Every write/set_feature must match these bytes, in order.
        pub fn with_expected_writes(self, writes: Vec<Vec<u8>>) -> Self {
            self.sh.borrow_mut().expect_writes = writes;
            self
        }
        pub fn with_open_ok(self, ok: bool) -> Self {
            self.sh.borrow_mut().open_ok = ok;
            self
        }
        pub fn with_write_ok(self, ok: bool) -> Self {
            self.sh.borrow_mut().write_ok = ok;
            self
        }
        pub fn opens(&self) -> u32 {
            self.sh.borrow().opens
        }
        pub fn writes(&self) -> Vec<Vec<u8>> {
            self.sh.borrow().writes.clone()
        }
        #[allow(dead_code)] // kept for tests that assert on which collections were opened
        pub fn opened_colls(&self) -> Vec<HidColl> {
            self.sh.borrow().open_colls.clone()
        }
    }

    impl Default for MockFactory {
        fn default() -> Self {
            Self::new()
        }
    }

    impl HidFactory for MockFactory {
        fn open(&mut self, coll: &HidColl) -> Option<Box<dyn HidIo>> {
            self.open_feature_only(coll)
        }
        fn open_read_only(&mut self, coll: &HidColl) -> Option<Box<dyn HidIo>> {
            self.open_feature_only(coll)
        }
        fn open_feature_only(&mut self, coll: &HidColl) -> Option<Box<dyn HidIo>> {
            let mut sh = self.sh.borrow_mut();
            sh.opens += 1;
            sh.open_colls.push(coll.clone());
            if !sh.open_ok {
                return None;
            }
            Some(Box::new(MockHid { sh: self.sh.clone(), coll: coll.clone() }))
        }
    }

    /// Convenience: a context over a mock factory holding one collection.
    pub fn test_ctx(coll: HidColl, io: &mut MockFactory) -> PollContext<'_> {
        let mut ctx = PollContext::new(io);
        ctx.colls.push(coll);
        ctx
    }
}
