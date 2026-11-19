//! Optional bridge to HeadsetControl (github.com/Sapd/HeadsetControl), which supports many more
//! headsets than the built-in drivers. If headsetcontrol.exe sits next to batterymon-proto.exe or
//! is on PATH, it is run with `-o json` and any headset not already handled here is added.

use std::collections::BTreeMap;
use std::sync::atomic::{AtomicI32, Ordering};
use std::sync::{Mutex, OnceLock};

use windows_sys::Win32::Foundation::{
    CloseHandle, MAX_PATH, HANDLE, HANDLE_FLAG_INHERIT, SetHandleInformation,
};
use windows_sys::Win32::Security::SECURITY_ATTRIBUTES;
use windows_sys::Win32::Storage::FileSystem::{
    GetFileAttributesW, ReadFile, SearchPathW, INVALID_FILE_ATTRIBUTES,
};
use windows_sys::Win32::System::LibraryLoader::GetModuleFileNameW;
use windows_sys::Win32::System::Pipes::{CreatePipe, PeekNamedPipe};
use windows_sys::Win32::System::Threading::{
    CreateProcessW, TerminateProcess, CREATE_NO_WINDOW, PROCESS_INFORMATION, STARTF_USESTDHANDLES,
    STARTUPINFOW,
};

use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{clamp100, hex4, PollContext};
use crate::win::{now_ms, sleep_ms, to_wide, wide_to_string};

// GetEnvironmentVariableW lives in windows-sys' Win32_System_Environment module, which the crate
// does not enable; declare the kernel32 export directly, as the C++ <winbase.h> include does.
#[link(name = "kernel32")]
unsafe extern "system" {
    fn GetEnvironmentVariableW(lpname: *const u16, lpbuffer: *mut u16, nsize: u32) -> u32;
}

// ---- minimal JSON reader (objects, arrays, strings, numbers, literals) -----------------------

#[derive(Clone, Copy, PartialEq, Eq, Default)]
enum JType {
    #[default]
    Null,
    Bool,
    Num,
    Str,
    Arr,
    Obj,
}

#[derive(Clone, Default)]
struct Json {
    typ: JType,
    num: f64,
    str_: String,
    arr: Vec<Json>,
    obj: BTreeMap<String, Json>,
}

impl Json {
    fn get(&self, k: &str) -> Option<&Json> { self.obj.get(k) }
}

struct Parser<'a> {
    p: &'a [u8],
    i: usize,
}

impl<'a> Parser<'a> {
    fn ws(&mut self) {
        while self.i < self.p.len() && matches!(self.p[self.i], b' ' | b'\n' | b'\r' | b'\t') {
            self.i += 1;
        }
    }

    fn parse(&mut self, v: &mut Json, depth: i32) -> bool {
        if depth > 32 { return false; }
        self.ws();
        if self.i >= self.p.len() { return false; }
        match self.p[self.i] {
            b'{' => {
                v.typ = JType::Obj;
                self.i += 1;
                self.ws();
                if self.i < self.p.len() && self.p[self.i] == b'}' { self.i += 1; return true; }
                loop {
                    self.ws();
                    if self.i >= self.p.len() || self.p[self.i] != b'"' { return false; }
                    let mut key = String::new();
                    if !self.parse_string(&mut key) { return false; }
                    self.ws();
                    if self.i >= self.p.len() || self.p[self.i] != b':' { return false; }
                    self.i += 1;
                    let mut item = Json::default();
                    if !self.parse(&mut item, depth + 1) { return false; }
                    v.obj.insert(key, item);
                    self.ws();
                    if self.i < self.p.len() && self.p[self.i] == b',' { self.i += 1; continue; }
                    if self.i < self.p.len() && self.p[self.i] == b'}' { self.i += 1; return true; }
                    return false;
                }
            }
            b'[' => {
                v.typ = JType::Arr;
                self.i += 1;
                self.ws();
                if self.i < self.p.len() && self.p[self.i] == b']' { self.i += 1; return true; }
                loop {
                    let mut item = Json::default();
                    if !self.parse(&mut item, depth + 1) { return false; }
                    v.arr.push(item);
                    self.ws();
                    if self.i < self.p.len() && self.p[self.i] == b',' { self.i += 1; continue; }
                    if self.i < self.p.len() && self.p[self.i] == b']' { self.i += 1; return true; }
                    return false;
                }
            }
            b'"' => {
                v.typ = JType::Str;
                self.parse_string(&mut v.str_)
            }
            b't' | b'f' | b'n' => {
                v.typ = if self.p[self.i] == b'n' { JType::Null } else { JType::Bool };
                v.num = if self.p[self.i] == b't' { 1.0 } else { 0.0 };
                while self.i < self.p.len() && self.p[self.i].is_ascii_alphabetic() { self.i += 1; }
                true
            }
            _ => {
                // strtod(p, &end): the longest valid decimal prefix; none -> failure.
                let Some((num, len)) = number_prefix(&self.p[self.i..]) else { return false };
                v.num = num;
                v.typ = JType::Num;
                self.i += len;
                true
            }
        }
    }

    fn parse_string(&mut self, out: &mut String) -> bool {
        self.i += 1;  // opening quote
        let mut bytes: Vec<u8> = Vec::new();
        while self.i < self.p.len() && self.p[self.i] != b'"' {
            if self.p[self.i] == b'\\' && self.i + 1 < self.p.len() {
                self.i += 1;
                let c = self.p[self.i];
                self.i += 1;
                match c {
                    b'n' => bytes.push(b'\n'),
                    b't' => bytes.push(b'\t'),
                    b'u' => {
                        self.i = (self.i + 4).min(self.p.len());  // \uXXXX is skipped, not decoded
                        bytes.push(b'?');
                    }
                    _ => bytes.push(c),
                }
            } else {
                bytes.push(self.p[self.i]);
                self.i += 1;
            }
        }
        if self.i >= self.p.len() { return false; }
        self.i += 1;  // closing quote
        // The C++ keeps raw bytes and widens them later; HeadSetControl emits valid UTF-8, and
        // invalid bytes become the replacement character instead of an empty string.
        *out = String::from_utf8_lossy(&bytes).into_owned();
        true
    }
}

/// The longest valid decimal number at the start of `b` (what strtod consumes), or None.
fn number_prefix(b: &[u8]) -> Option<(f64, usize)> {
    let mut i = 0;
    if i < b.len() && (b[i] == b'+' || b[i] == b'-') { i += 1; }
    let mut digits = 0;
    while i < b.len() && b[i].is_ascii_digit() { i += 1; digits += 1; }
    if i < b.len() && b[i] == b'.' {
        i += 1;
        while i < b.len() && b[i].is_ascii_digit() { i += 1; digits += 1; }
    }
    if digits == 0 { return None; }
    let mut end = i;
    if i < b.len() && (b[i] == b'e' || b[i] == b'E') {
        let mut k = i + 1;
        if k < b.len() && (b[k] == b'+' || b[k] == b'-') { k += 1; }
        let mut exp_digits = 0;
        while k < b.len() && b[k].is_ascii_digit() { k += 1; exp_digits += 1; }
        if exp_digits > 0 { end = k; }
    }
    let text = std::str::from_utf8(&b[..end]).ok()?;
    Some((text.parse::<f64>().ok()?, end))
}

/// MultiByteToWideChar(CP_UTF8) on the parser's output; the model keeps names as String already.
fn widen(s: &str) -> String { s.to_string() }

/// strtoul(s, nullptr, 16): leading whitespace, optional sign, optional "0x", then hex digits;
/// no digits -> 0. (Overflow saturates at ULONG_MAX like strtoul.)
fn strtoul16(s: &str) -> u32 {
    let b = s.as_bytes();
    let mut i = 0;
    while i < b.len() && matches!(b[i], b' ' | b'\t' | b'\n' | b'\r' | 0x0b | 0x0c) { i += 1; }
    let mut neg = false;
    if i < b.len() && (b[i] == b'+' || b[i] == b'-') { neg = b[i] == b'-'; i += 1; }
    if i + 1 < b.len() && b[i] == b'0' && (b[i + 1] == b'x' || b[i + 1] == b'X') { i += 2; }
    let mut v: u64 = 0;
    let mut digits = 0;
    while i < b.len() {
        let d = match b[i] {
            b'0'..=b'9' => (b[i] - b'0') as u64,
            b'a'..=b'f' => (b[i] - b'a' + 10) as u64,
            b'A'..=b'F' => (b[i] - b'A' + 10) as u64,
            _ => break,
        };
        v = (v * 16 + d).min(u32::MAX as u64);
        digits += 1;
        i += 1;
    }
    if digits == 0 { return 0; }
    if neg { (v as u32).wrapping_neg() } else { v as u32 }
}

fn find_exe() -> String {
    let mut self_path = [0u16; MAX_PATH as usize];
    unsafe { GetModuleFileNameW(std::ptr::null_mut(), self_path.as_mut_ptr(), MAX_PATH) };
    let self_path = wide_to_string(&self_path);
    let dir_end = self_path.rfind(['\\', '/']).map(|i| i + 1).unwrap_or(0);
    let local = format!("{}headsetcontrol.exe", &self_path[..dir_end]);
    if unsafe { GetFileAttributesW(to_wide(&local).as_ptr()) } != INVALID_FILE_ATTRIBUTES { return local; }
    let mut found = [0u16; MAX_PATH as usize];
    if unsafe {
        SearchPathW(std::ptr::null(), to_wide("headsetcontrol.exe").as_ptr(), std::ptr::null(),
                    MAX_PATH, found.as_mut_ptr(), std::ptr::null_mut())
    } != 0 {
        return wide_to_string(&found);
    }
    String::new()
}

/// Runs the command line and returns its stdout (empty on failure or after `timeout_ms`).
fn run(cmd: &str, timeout_ms: u64) -> String {
    let sa = SECURITY_ATTRIBUTES {
        nLength: std::mem::size_of::<SECURITY_ATTRIBUTES>() as u32,
        lpSecurityDescriptor: std::ptr::null_mut(),
        bInheritHandle: 1,
    };
    let mut rd: HANDLE = std::ptr::null_mut();
    let mut wr: HANDLE = std::ptr::null_mut();
    if unsafe { CreatePipe(&mut rd, &mut wr, &sa, 0) } == 0 { return String::new(); }
    unsafe { SetHandleInformation(rd, HANDLE_FLAG_INHERIT, 0) };
    let mut si: STARTUPINFOW = unsafe { std::mem::zeroed() };
    si.cb = std::mem::size_of::<STARTUPINFOW>() as u32;
    si.dwFlags = STARTF_USESTDHANDLES;
    si.hStdOutput = wr;
    si.hStdError = wr;
    si.hStdInput = std::ptr::null_mut();
    let mut pi: PROCESS_INFORMATION = unsafe { std::mem::zeroed() };
    let mut cmdw = to_wide(cmd);
    let ok = unsafe {
        CreateProcessW(std::ptr::null(), cmdw.as_mut_ptr(), std::ptr::null(), std::ptr::null(), 1,
                       CREATE_NO_WINDOW, std::ptr::null(), std::ptr::null(), &si, &mut pi)
    };
    unsafe { CloseHandle(wr) };
    let mut out: Vec<u8> = Vec::new();
    if ok != 0 {
        let end = now_ms() + timeout_ms;
        let mut buf = [0u8; 4096];
        loop {
            let mut avail: u32 = 0;
            // pipe closed: process done
            if unsafe { PeekNamedPipe(rd, std::ptr::null_mut(), 0, std::ptr::null_mut(), &mut avail, std::ptr::null_mut()) } == 0 { break; }
            if avail != 0 {
                let mut n: u32 = 0;
                if unsafe { ReadFile(rd, buf.as_mut_ptr(), buf.len() as u32, &mut n, std::ptr::null_mut()) } == 0 || n == 0 { break; }
                out.extend_from_slice(&buf[..n as usize]);
                if out.len() > (1 << 20) { break; }
                continue;
            }
            if (end as i64 - now_ms() as i64) <= 0 {
                unsafe { TerminateProcess(pi.hProcess, 1) };
                out.clear();
                break;
            }
            sleep_ms(20);
        }
        unsafe {
            CloseHandle(pi.hThread);
            CloseHandle(pi.hProcess);
        }
    }
    unsafe { CloseHandle(rd) };
    String::from_utf8_lossy(&out).into_owned()
}

/// One headset as last reported by HeadsetControl.
#[derive(Clone)]
struct HscDevice {
    vid: u16,
    pid: u16,
    status: DeviceStatus,
}

fn parse(text: &str) -> Vec<HscDevice> {
    let mut out: Vec<HscDevice> = Vec::new();
    let Some(start) = text.find('{') else { return out };
    let mut root = Json::default();
    let mut ps = Parser { p: text.as_bytes(), i: start };
    if !ps.parse(&mut root, 0) || root.typ != JType::Obj { return out; }
    let Some(devices) = root.get("devices") else { return out };
    if devices.typ != JType::Arr { return out; }
    for d in &devices.arr {
        let (Some(vid_j), Some(pid_j), Some(bat)) = (d.get("id_vendor"), d.get("id_product"), d.get("battery")) else { continue };
        if bat.typ != JType::Obj { continue; }
        let vid = strtoul16(&vid_j.str_) as u16;
        let pid = strtoul16(&pid_j.str_) as u16;
        let status = bat.get("status");
        let level = bat.get("level");
        let st = status.map(|s| s.str_.as_str()).unwrap_or("");
        let mut s = DeviceStatus::default();
        s.key = format!("hsc:{}:{}", hex4(vid), hex4(pid));
        s.name = match d.get("device") {
            Some(name) if !name.str_.is_empty() => widen(&name.str_),
            _ => "Headset".into(),
        };
        s.kind = DeviceKind::Headset;
        s.via = "HeadsetControl".into();
        s.charging = st == "BATTERY_CHARGING";
        s.connected = st == "BATTERY_AVAILABLE" || st == "BATTERY_CHARGING";
        if s.connected {
            if let Some(level) = level {
                if level.typ == JType::Num && level.num >= 0.0 {
                    s.percent = clamp100(level.num as i32);
                }
            }
        }
        out.push(HscDevice { vid, pid, status: s });
    }
    out
}

// HeadsetControl can take several seconds per headset, so it runs on its own thread and the regular
// poll uses its latest result instead of waiting for it. Only the battery is requested (-b), with
// a short HID timeout so a sleeping headset cannot stall it.
static G_DEVICES: Mutex<Vec<HscDevice>> = Mutex::new(Vec::new());
static G_UPDATED: Mutex<u64> = Mutex::new(0);
static G_RUNNING: AtomicI32 = AtomicI32::new(0);  // LONG g_running

fn command() -> String {
    static EXE: OnceLock<String> = OnceLock::new();
    let exe = EXE.get_or_init(find_exe);
    if exe.is_empty() { return String::new(); }
    let mut cmd = format!("\"{exe}\" -b -o json --timeout 1500");
    let mut test = [0u16; 8];
    if unsafe { GetEnvironmentVariableW(to_wide("WB_HSC_TEST_DEVICE").as_ptr(), test.as_mut_ptr(), 8) } != 0 {
        cmd += " --test-device";  // for development
    }
    cmd
}

fn refresh() {
    let cmd = command();
    let found = if cmd.is_empty() { Vec::new() } else { parse(&run(&cmd, 30000)) };
    *G_DEVICES.lock().unwrap() = found;
    *G_UPDATED.lock().unwrap() = now_ms();
}

fn refresh_thread() {
    refresh();
    G_RUNNING.store(0, Ordering::SeqCst);  // InterlockedExchange(&g_running, 0)
}

pub fn poll_headsetcontrol(ctx: &mut PollContext) {
    if command().is_empty() { return; }
    let now = now_ms();
    if *G_UPDATED.lock().unwrap() == 0 {
        refresh();  // first poll: wait for it, so the first display (and --list) is complete
    } else if now - *G_UPDATED.lock().unwrap() > 50000
        && G_RUNNING.compare_exchange(0, 1, Ordering::SeqCst, Ordering::SeqCst).is_ok() {
        // CreateThread + CloseHandle: run it in the background, do not wait for it.
        std::thread::spawn(refresh_thread);
    }
    let devices = G_DEVICES.lock().unwrap().clone();
    for h in &devices {
        if !ctx.is_claimed(h.vid, h.pid) {
            ctx.add(h.status.clone(), h.vid, h.pid);
        }
    }
}
