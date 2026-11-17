// App icons (pinned layer P5, decision 9): a rail item's icon read from a program's `.exe`, as a PNG for the asset store.
// The studio names the program by its file name only (`Chat.exe`, as auto-switch rules do); the server finds it among
// the programs running now, then the App Paths Windows keeps for installed programs, then the folders on PATH. Only a
// path on a local drive is read: a network path (`\\server\share`) is never opened, so naming a program can't make the
// server reach another machine. The icon is drawn at `SIZE` px by Windows and kept as a PNG with its alpha.
//
// Off Windows there are no `.exe` icons: `supported()` is false and the route says so.

use std::path::{Path, PathBuf};

/// The side of the PNG, px: the rail draws an icon at up to 40 px, so this is sharp at twice that.
pub const SIZE: u32 = 96;
/// The longest program name read.
const NAME_MAX: usize = 128;

/// Whether this system has `.exe` icons to read.
pub const fn supported() -> bool {
    cfg!(windows)
}

/// A program's file name as the studio sends it: `name.exe`, no folder, no drive, nothing a path could hide in.
pub fn is_exe_name(s: &str) -> bool {
    let stem = s.len().checked_sub(4).map(|n| &s[..n]);
    (5..=NAME_MAX).contains(&s.len())
        && s.to_ascii_lowercase().ends_with(".exe")
        && !s.starts_with(['.', ' '])
        && stem.is_some_and(|st| !st.ends_with([' ', '.']))
        && s.chars().all(|c| c.is_alphanumeric() || matches!(c, ' ' | '.' | '_' | '-' | '(' | ')' | '+' | '&' | ','))
}

/// Whether a path is on a local drive (`C:\…`): not a network share, a device path or a relative one.
pub fn is_local_drive_path(path: &Path) -> bool {
    let s = path.to_string_lossy();
    let b = s.as_bytes();
    b.len() > 3 && b[0].is_ascii_alphabetic() && b[1] == b':' && (b[2] == b'\\' || b[2] == b'/')
}

/// The file in `candidates` named `name` (any case), on a local drive.
pub fn first_named(name: &str, candidates: impl IntoIterator<Item = PathBuf>) -> Option<PathBuf> {
    candidates.into_iter().find(|p| is_local_drive_path(p) && p.file_name().is_some_and(|n| n.to_string_lossy().eq_ignore_ascii_case(name)) && p.is_file())
}

/// The programs running now, by their image paths.
fn running() -> Vec<PathBuf> {
    use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};
    let mut sys = System::new();
    sys.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing().with_exe(UpdateKind::Always));
    sys.processes().values().filter_map(|p| p.exe().map(Path::to_path_buf)).collect()
}

/// The folders on PATH that are on a local drive, each with the program's name.
fn on_path(name: &str) -> Vec<PathBuf> {
    std::env::var_os("PATH").map_or_else(Vec::new, |path| std::env::split_paths(&path).filter(|d| is_local_drive_path(d)).map(|d| d.join(name)).collect())
}

/// The path Windows' App Paths key gives a program (the current user's, then the machine's).
#[cfg(windows)]
fn app_path(name: &str) -> Option<PathBuf> {
    use windows::core::{HSTRING, PCWSTR};
    use windows::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, RRF_RT_REG_EXPAND_SZ, RRF_RT_REG_SZ};
    let key = HSTRING::from(format!(r"Software\Microsoft\Windows\CurrentVersion\App Paths\{name}"));
    [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE].into_iter().find_map(|root| {
        let mut buf = [0u16; 1024];
        let mut size = std::mem::size_of_val(&buf) as u32;
        // SAFETY: the default value, a string (expanded when it is REG_EXPAND_SZ), is written into `buf`, whose size `size` gives.
        let status = unsafe { RegGetValueW(root, &key, PCWSTR::null(), RRF_RT_REG_SZ | RRF_RT_REG_EXPAND_SZ, None, Some(buf.as_mut_ptr().cast()), Some(&mut size)) };
        if status.is_err() {
            return None;
        }
        let len = (size as usize / 2).min(buf.len());
        let text = String::from_utf16_lossy(&buf[..len]);
        let text = text.trim_end_matches('\0').trim().trim_matches('"');
        (!text.is_empty()).then(|| PathBuf::from(text))
    })
}

#[cfg(not(windows))]
fn app_path(_name: &str) -> Option<PathBuf> {
    None
}

/// Where a program is: running now, else its App Paths entry, else on PATH; a local drive only.
pub fn resolve(name: &str) -> Option<PathBuf> {
    if !is_exe_name(name) {
        return None;
    }
    first_named(name, running()).or_else(|| first_named(name, app_path(name))).or_else(|| first_named(name, on_path(name)))
}

/// BGRA rows from Windows as RGBA; when no pixel has alpha (an old icon), the mask's black pixels are the opaque ones.
pub fn rgba_of(bgra: &[u8], mask: Option<&[u8]>) -> Vec<u8> {
    let pixels = bgra.as_chunks::<4>().0;
    let has_alpha = pixels.iter().any(|p| p[3] != 0);
    pixels
        .iter()
        .enumerate()
        .flat_map(|(i, p)| {
            let alpha = if has_alpha { p[3] } else { mask.and_then(|m| m.get(i * 4)).map_or(255, |&m| if m == 0 { 255 } else { 0 }) };
            [p[2], p[1], p[0], alpha]
        })
        .collect()
}

/// RGBA pixels as a PNG.
pub fn encode_png(rgba: &[u8], width: u32, height: u32) -> Option<Vec<u8>> {
    let mut out = Vec::new();
    let mut encoder = png::Encoder::new(&mut out, width, height);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder.write_header().ok()?;
    writer.write_image_data(rgba).ok()?;
    writer.finish().ok()?;
    Some(out)
}

/// The program's first icon at `SIZE` px as a PNG, or `None` (no icon, or a path that is not a local file).
#[cfg(windows)]
pub fn icon_png(path: &Path) -> Option<Vec<u8>> {
    use windows_sys::Win32::Graphics::Gdi::{DeleteObject, GetDC, GetDIBits, ReleaseDC, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS};
    use windows_sys::Win32::UI::WindowsAndMessaging::{DestroyIcon, GetIconInfo, PrivateExtractIconsW, ICONINFO};
    if !is_local_drive_path(path) {
        return None;
    }
    let wide: Vec<u16> = path.as_os_str().to_string_lossy().encode_utf16().chain(std::iter::once(0)).collect();
    let side = SIZE as i32;
    // SAFETY: plain Win32 calls. The icon and the bitmaps GetIconInfo makes are this function's to free, and are freed on
    // every path; each buffer outlives the call that fills it and is the size the header gives.
    unsafe {
        let mut icon = std::ptr::null_mut();
        let mut id = 0u32;
        let got = PrivateExtractIconsW(wide.as_ptr(), 0, side, side, &mut icon, &mut id, 1, 0);
        if got == 0 || got == u32::MAX || icon.is_null() {
            return None;
        }
        let mut info: ICONINFO = std::mem::zeroed();
        let read = GetIconInfo(icon, &mut info) != 0;
        let mut pixels = None;
        if read && !info.hbmColor.is_null() {
            let dc = GetDC(std::ptr::null_mut());
            let mut header: BITMAPINFO = std::mem::zeroed();
            header.bmiHeader = BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: side,
                biHeight: -side, // top-down rows
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB,
                ..std::mem::zeroed()
            };
            let mut color = vec![0u8; (SIZE * SIZE * 4) as usize];
            let mut mask = vec![0u8; (SIZE * SIZE * 4) as usize];
            let mut mask_header = header;
            let color_rows = GetDIBits(dc, info.hbmColor, 0, SIZE, color.as_mut_ptr().cast(), &mut header, DIB_RGB_COLORS);
            let mask_rows = GetDIBits(dc, info.hbmMask, 0, SIZE, mask.as_mut_ptr().cast(), &mut mask_header, DIB_RGB_COLORS);
            ReleaseDC(std::ptr::null_mut(), dc);
            if color_rows == side {
                pixels = Some(rgba_of(&color, (mask_rows == side).then_some(mask.as_slice())));
            }
        }
        if read {
            if !info.hbmColor.is_null() {
                DeleteObject(info.hbmColor);
            }
            if !info.hbmMask.is_null() {
                DeleteObject(info.hbmMask);
            }
        }
        DestroyIcon(icon);
        encode_png(&pixels?, SIZE, SIZE)
    }
}

#[cfg(not(windows))]
pub fn icon_png(_path: &Path) -> Option<Vec<u8>> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_program_name_is_a_file_name_and_nothing_more() {
        for ok in ["Chat.exe", "obs64.EXE", "Code - Insiders.exe", "notepad++.exe", "Spotify (1).exe"] {
            assert!(is_exe_name(ok), "{ok}");
        }
        for bad in [
            "", ".exe", "chat", "chat.exe.png", "..\\x.exe", "C:\\x.exe", "c:x.exe", "\\\\server\\share\\x.exe", "//server/x.exe", "a/b.exe", "x.exe\0",
            ".hidden.exe", " x.exe", "x .exe", "x..exe", "%TEMP%.exe", "x\u{202e}exe.exe", &format!("{}.exe", "a".repeat(200)),
        ] {
            assert!(!is_exe_name(bad), "{bad:?}");
        }
    }

    #[test]
    fn only_a_local_drive_path_is_read() {
        assert!(is_local_drive_path(Path::new("C:\\Program Files\\x.exe")));
        assert!(is_local_drive_path(Path::new("d:/apps/x.exe")));
        for bad in ["\\\\server\\share\\x.exe", "\\\\?\\UNC\\server\\x.exe", "\\\\?\\C:\\x.exe", "\\\\.\\pipe\\x", "x.exe", "C:x.exe", "/usr/bin/x"] {
            assert!(!is_local_drive_path(Path::new(bad)), "{bad}");
        }
        // a network candidate is skipped without being opened
        assert_eq!(first_named("x.exe", [PathBuf::from("\\\\nowhere.invalid\\share\\x.exe")]), None);
    }

    #[test]
    fn finds_the_named_file_in_any_case() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("Chat.exe");
        std::fs::write(&file, b"MZ").unwrap();
        let found = first_named("chat.EXE", [dir.path().join("other.exe"), file.clone()]);
        assert_eq!(found.is_some(), is_local_drive_path(&file));
        assert_eq!(resolve("..\\Chat.exe"), None);
    }

    #[test]
    fn keeps_alpha_or_reads_the_mask() {
        // one opaque red pixel with alpha, one clear: BGRA in, RGBA out
        assert_eq!(rgba_of(&[0, 0, 255, 255, 0, 0, 0, 0], None), vec![255, 0, 0, 255, 0, 0, 0, 0]);
        // no alpha anywhere: the mask's black is opaque, its white is clear
        assert_eq!(rgba_of(&[0, 255, 0, 0, 255, 0, 0, 0], Some(&[0, 0, 0, 0, 255, 255, 255, 0])), vec![0, 255, 0, 255, 0, 0, 255, 0]);
        let png = encode_png(&[0; 4 * 4], 2, 2).unwrap();
        assert!(png.starts_with(&[0x89, b'P', b'N', b'G']));
    }

    #[cfg(windows)]
    #[test]
    fn reads_a_windows_program_icon_as_a_png() {
        let notepad = PathBuf::from(std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".into())).join("System32\\notepad.exe");
        if !notepad.is_file() {
            return;
        }
        let png = icon_png(&notepad).expect("notepad has an icon");
        assert!(png.starts_with(&[0x89, b'P', b'N', b'G']));
        assert_eq!(icon_png(Path::new("\\\\nowhere.invalid\\share\\x.exe")), None);
    }
}
