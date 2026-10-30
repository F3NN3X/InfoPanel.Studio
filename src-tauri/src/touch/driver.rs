// Giving a touchscreen back to Windows (Settings › Touch): installing WinUSB is the user's step (Zadig, guided by the
// page); uninstalling is automated. An elevated PowerShell script (one UAC prompt) removes the WinUSB binding for this
// vid:pid and the certificate libwdi/Zadig left for it, and Windows rebinds its own HID driver.

use serde::Serialize;
use std::path::Path;

#[derive(Debug, Serialize)]
pub struct Uninstalled {
    /// False when nothing was bound to WinUSB (the certificate is still removed).
    changed: bool,
    log: String,
}

#[cfg(windows)]
pub fn uninstall(dir: &Path, vid: u16, pid: u16) -> Result<Uninstalled, String> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    const SCRIPT: &str = include_str!("uninstall-winusb.ps1");
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    // In the app's own data folder (per user), not %TEMP%, since it runs elevated.
    let script = dir.join("uninstall-winusb.ps1");
    let launcher = dir.join("uninstall-launcher.ps1");
    let log = dir.join("uninstall-winusb.log");
    let _ = std::fs::remove_file(&log);
    std::fs::write(&script, SCRIPT).map_err(|e| e.to_string())?;
    std::fs::write(&launcher, launcher_text(&script, &log, vid, pid)).map_err(|e| e.to_string())?;
    log::info!("touch: uninstalling WinUSB for {vid:04x}:{pid:04x} (admin prompt)");
    let status = Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
        ])
        .arg(&launcher)
        .creation_flags(CREATE_NO_WINDOW)
        .status()
        .map_err(|e| format!("starting PowerShell: {e}"))?;
    let text = std::fs::read_to_string(&log).unwrap_or_default();
    log::info!("touch: uninstall exited {:?}\n{text}", status.code());
    match status.code() {
        Some(0) => Ok(Uninstalled {
            changed: true,
            log: text,
        }),
        Some(2) => Ok(Uninstalled {
            changed: false,
            log: text,
        }),
        Some(CANCELLED) => Err("Cancelled at the Windows admin prompt.".into()),
        code => Err(format!(
            "The uninstall failed (exit {code:?}); see the log below.\n{text}"
        )),
    }
}

#[cfg(not(windows))]
pub fn uninstall(_dir: &Path, _vid: u16, _pid: u16) -> Result<Uninstalled, String> {
    Err("Drivers are only swapped on Windows.".into())
}

/// Exit code the launcher uses when the admin prompt is declined (Windows' ERROR_CANCELLED).
const CANCELLED: i32 = 1223;

/// A single-quoted PowerShell string literal.
fn ps_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "''"))
}

/// Runs the script elevated and hands back its exit code; a declined prompt exits 1223.
fn launcher_text(script: &Path, log: &Path, vid: u16, pid: u16) -> String {
    // Start-Process joins -ArgumentList with spaces, so paths carry their own double quotes.
    let arg = |p: &Path| ps_quote(&format!("\"{}\"", p.display()));
    format!(
        "try {{\n  $p = Start-Process -FilePath powershell.exe -Verb RunAs -Wait -PassThru -WindowStyle Hidden \
         -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',{},'-Vid','{vid:04X}','-ProductId','{pid:04X}','-Log',{})\n  \
         exit $p.ExitCode\n}} catch {{ exit {CANCELLED} }}\n",
        arg(script),
        arg(log),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_launcher_passes_quoted_paths_and_hex_ids() {
        let t = launcher_text(
            Path::new(r"C:\A B\s.ps1"),
            Path::new(r"C:\A B\s.log"),
            0x222A,
            0x1,
        );
        assert!(
            t.contains(r#"'-File','"C:\A B\s.ps1"','-Vid','222A','-ProductId','0001','-Log','"C:\A B\s.log"'"#),
            "{t}"
        );
        assert!(t.contains("catch { exit 1223 }"), "{t}");
    }

    #[test]
    fn quotes_survive_powershell_strings() {
        assert_eq!(ps_quote(r"C:\Users\o'neil\x"), r"'C:\Users\o''neil\x'");
    }
}
