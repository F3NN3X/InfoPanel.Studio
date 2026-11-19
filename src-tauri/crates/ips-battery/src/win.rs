//! Small Win32 helpers shared across the app: wide/UTF-8 conversion, time, sleep.

use std::time::Duration;

use windows_sys::Win32::System::SystemInformation::GetTickCount64;

/// NUL-terminated UTF-16 buffer for the W APIs.
pub fn to_wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

/// A wide buffer (may or may not be NUL-terminated) as UTF-8.
pub fn wide_to_string(w: &[u16]) -> String {
    let end = w.iter().position(|&c| c == 0).unwrap_or(w.len());
    String::from_utf16_lossy(&w[..end])
}

/// C++ `GetTickCount64()`: steady milliseconds since boot.
pub fn now_ms() -> u64 {
    unsafe { GetTickCount64() }
}

/// C++ `Sleep(ms)`; also the portable `PlatSleep`.
pub fn sleep_ms(ms: u32) {
    std::thread::sleep(Duration::from_millis(ms as u64));
}
