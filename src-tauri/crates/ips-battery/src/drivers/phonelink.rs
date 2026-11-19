//! Phones linked with Microsoft Phone Link (formerly "Your Phone"), over Wi-Fi or Bluetooth.
//! Phone Link keeps the Windows 11 Start menu companion card up to date in its package folder:
//!   %LOCALAPPDATA%\Packages\Microsoft.YourPhone_8wekyb3d8bbwe\LocalState\StartMenu\StartMenuCompanion.json
//! It is an Adaptive Card whose "speak" field reads "<phone name> - Connected to your PC" and
//! whose battery element carries the tooltip "Battery <n>% remaining". Only those two fields are
//! read; the rest of the card (notification previews) is ignored.
//! The file is an undocumented Phone Link implementation detail, so the parse is strict: anything
//! unexpected means no phone is reported. Read-only, no device or network access.

use windows_sys::Win32::Foundation::{
    CloseHandle, FILETIME, GENERIC_READ, INVALID_HANDLE_VALUE, MAX_PATH,
};
use windows_sys::Win32::Storage::FileSystem::{
    CreateFileW, GetFileSizeEx, GetFileTime, ReadFile, FILE_ATTRIBUTE_NORMAL, FILE_SHARE_DELETE,
    FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING,
};
use windows_sys::Win32::System::SystemInformation::GetSystemTimeAsFileTime;

use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::PollContext;
use crate::win::{to_wide, wide_to_string};

// GetEnvironmentVariableW lives in windows-sys' Win32_System_Environment module, which the crate
// does not enable; declare the kernel32 export directly, as the C++ <winbase.h> include does.
#[link(name = "kernel32")]
unsafe extern "system" {
    fn GetEnvironmentVariableW(lpname: *const u16, lpbuffer: *mut u16, nsize: u32) -> u32;
}

/// A card that has not been rewritten for this long is shown dimmed, as a last known value.
const K_STALE_SEC: u64 = 3 * 60 * 60;

/// Reads the whole file and converts it from UTF-8; returns the text and the last-write time.
fn read_utf8_file(path: &str) -> Option<(String, FILETIME)> {
    let wide = to_wide(path);
    let h = unsafe {
        CreateFileW(wide.as_ptr(), GENERIC_READ,
                    FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, std::ptr::null(),
                    OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, std::ptr::null_mut())
    };
    if h == INVALID_HANDLE_VALUE { return None; }
    let mut size: i64 = 0;
    let mut written = FILETIME { dwLowDateTime: 0, dwHighDateTime: 0 };
    let mut ok = unsafe { GetFileSizeEx(h, &mut size) } != 0 && size > 0 && size < 4 * 1024 * 1024;
    if ok {
        ok = unsafe { GetFileTime(h, std::ptr::null_mut(), std::ptr::null_mut(), &mut written) } != 0;
    }
    let mut bytes: Vec<u8> = Vec::new();
    if ok {
        bytes = vec![0u8; size as usize];
        let mut got: u32 = 0;
        ok = unsafe { ReadFile(h, bytes.as_mut_ptr(), bytes.len() as u32, &mut got, std::ptr::null_mut()) } != 0
            && got as usize == bytes.len();
    }
    unsafe { CloseHandle(h); }
    if !ok { return None; }
    // MultiByteToWideChar(CP_UTF8): the file must be valid UTF-8, otherwise the read fails.
    Some((String::from_utf8(bytes).ok()?, written))
}

/// `haystack.find(needle)` over UTF-16 units (the C++ scans a std::wstring, one wchar_t at a time).
fn find_units(haystack: &[u16], needle: &[u16], from: usize) -> Option<usize> {
    if needle.is_empty() { return Some(from); }
    if haystack.len() < needle.len() { return None; }
    (from..=haystack.len() - needle.len()).find(|&s| haystack[s..s + needle.len()] == *needle)
}

/// wcstoul(s, nullptr, 16) over a short unit window: leading whitespace, optional sign, optional
/// "0x", then hex digits; no digits -> 0. (Overflow saturates at ULONG_MAX like strtoul.)
fn wcstoul16(s: &[u16]) -> u32 {
    let mut i = 0;
    while i < s.len() && matches!(s[i], 0x20 | 0x09 | 0x0A | 0x0D | 0x0B | 0x0C) { i += 1; }
    let mut neg = false;
    if i < s.len() && (s[i] == b'+' as u16 || s[i] == b'-' as u16) { neg = s[i] == b'-' as u16; i += 1; }
    if i + 1 < s.len() && s[i] == b'0' as u16 && (s[i + 1] == b'x' as u16 || s[i + 1] == b'X' as u16) { i += 2; }
    let mut v: u64 = 0;
    let mut digits = 0;
    while i < s.len() {
        let d = match s[i] {
            c if (b'0' as u16..=b'9' as u16).contains(&c) => (c - b'0' as u16) as u64,
            c if (b'a' as u16..=b'f' as u16).contains(&c) => (c - b'a' as u16) as u64 + 10,
            c if (b'A' as u16..=b'F' as u16).contains(&c) => (c - b'A' as u16) as u64 + 10,
            _ => break,
        };
        v = (v * 16 + d).min(u32::MAX as u64);
        digits += 1;
        i += 1;
    }
    if digits == 0 { return 0; }
    if neg { (v as u32).wrapping_neg() } else { v as u32 }
}

/// Value of the first JSON string field `"key":"..."` (simple escapes only).
fn json_string(json: &str, key: &str, value: &mut String) -> bool {
    // Work in UTF-16 units: the C++ walks a std::wstring index by index.
    let j: Vec<u16> = json.encode_utf16().collect();
    let pat: Vec<u16> = format!("\"{key}\":\"").encode_utf16().collect();
    let Some(mut i) = find_units(&j, &pat, 0) else { return false };
    i += pat.len();
    let mut out: Vec<u16> = Vec::new();
    while i < j.len() && j[i] != b'"' as u16 {
        if j[i] == b'\\' as u16 && i + 1 < j.len() {
            i += 1;  // ++i: the escape character
            let e = j[i];
            if e == b'u' as u16 && i + 4 < j.len() {
                out.push(wcstoul16(&j[i + 1..i + 5]) as u16);
                i += 4;  // the for loop's i++ then moves past the four units
            } else {
                out.push(if e == b'n' as u16 || e == b't' as u16 { b' ' as u16 } else { e });
            }
            i += 1;
        } else {
            out.push(j[i]);
            i += 1;
        }
    }
    if i >= j.len() { return false; }
    // The C++ keeps the raw wchar_t sequence; lone surrogates (malformed input only) are replaced.
    *value = String::from_utf16_lossy(&out);
    true
}

/// <n> from the first "Battery <n>% remaining".
fn battery_percent(json: &str) -> i32 {
    let j: Vec<u16> = json.encode_utf16().collect();
    let pat: Vec<u16> = "Battery ".encode_utf16().collect();
    let mut at = find_units(&j, &pat, 0);
    while let Some(pos) = at {
        let first_digit = pos + pat.len();
        let mut k = first_digit;
        while k < j.len() && (b'0' as u16..=b'9' as u16).contains(&j[k]) && k - first_digit < 3 { k += 1; }
        if k > first_digit && k + 11 <= j.len()
            && j[k..k + 11] == *"% remaining".encode_utf16().collect::<Vec<u16>>() {
            // _wtoi of the digit window (ASCII digits only by the scan above).
            let mut v: i32 = 0;
            for &u in &j[first_digit..k] { v = v * 10 + (u - b'0' as u16) as i32; }
            if (0..=100).contains(&v) { return v; }
        }
        at = find_units(&j, &pat, pos + 1);
    }
    -1
}

pub fn poll_phonelink(ctx: &mut PollContext) {
    let mut base = [0u16; MAX_PATH as usize];
    let n = unsafe { GetEnvironmentVariableW(to_wide("LOCALAPPDATA").as_ptr(), base.as_mut_ptr(), MAX_PATH) };
    if n == 0 || n >= MAX_PATH { return; }
    let path = format!("{}\\Packages\\Microsoft.YourPhone_8wekyb3d8bbwe\\LocalState\\StartMenu\\StartMenuCompanion.json",
                       wide_to_string(&base));

    let Some((json, written)) = read_utf8_file(&path) else { return };
    let mut speak = String::new();
    if !json_string(&json, "speak", &mut speak) { return; }
    // "Nothing Phone (4a) Pro - Connected to your PC"; anything else (disconnected, setup cards) is skipped.
    let suffix = " - Connected to your PC";
    if speak.chars().count() <= suffix.chars().count() || !speak.ends_with(suffix) { return; }
    let pct = battery_percent(&json);
    if pct < 0 { return; }

    let mut now = FILETIME { dwLowDateTime: 0, dwHighDateTime: 0 };
    unsafe { GetSystemTimeAsFileTime(&mut now); }
    let a = ((now.dwHighDateTime as u64) << 32) | now.dwLowDateTime as u64;
    let b = ((written.dwHighDateTime as u64) << 32) | written.dwLowDateTime as u64;
    let age_sec = if a > b { (a - b) / 10_000_000 } else { 0 };

    let mut s = DeviceStatus::default();
    s.key = "phonelink".into();
    s.name = speak[..speak.len() - suffix.len()].to_string();
    s.via = "Phone Link".into();
    s.kind = DeviceKind::Phone;
    s.percent = pct;
    s.asleep = age_sec > K_STALE_SEC;
    ctx.out.push(s);
}
