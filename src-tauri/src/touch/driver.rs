// Giving a touchscreen back to Windows (Settings › Touch): installing WinUSB is the user's step (Zadig, guided by the
// page); uninstalling is automated. An elevated PowerShell script (one UAC prompt, passed inline) removes the WinUSB
// binding for this vid:pid and the certificate libwdi/Zadig left for it, and Windows rebinds its own HID driver.

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
    let log = dir.join("uninstall-winusb.log");
    let _ = std::fs::remove_file(&log);
    log::info!("touch: uninstalling WinUSB for {vid:04x}:{pid:04x} (admin prompt)");
    // The launcher goes on the command line and the script inline (-EncodedCommand): nothing the elevated PowerShell
    // runs sits in a user-writable file that another process could swap before the prompt is accepted.
    let status = Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
        ])
        .arg(launcher_text(&elevated_command(SCRIPT, &log, vid, pid)))
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

/// The script as one `-EncodedCommand`: a script block called with its parameters, as base64 of UTF-16LE.
fn elevated_command(script: &str, log: &Path, vid: u16, pid: u16) -> String {
    use base64::Engine;
    let command = format!(
        "& {{\n{script}\n}} -Vid '{vid:04X}' -ProductId '{pid:04X}' -Log {}",
        ps_quote(&log.display().to_string())
    );
    let utf16: Vec<u8> = command.encode_utf16().flat_map(u16::to_le_bytes).collect();
    base64::engine::general_purpose::STANDARD.encode(utf16)
}

/// Runs the encoded command elevated and hands back its exit code; a declined prompt exits 1223.
fn launcher_text(encoded: &str) -> String {
    format!(
        "try {{ $p = Start-Process -FilePath powershell.exe -Verb RunAs -Wait -PassThru -WindowStyle Hidden \
         -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand','{encoded}'); \
         exit $p.ExitCode }} catch {{ exit {CANCELLED} }}"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_elevated_command_carries_the_script_and_its_arguments_inline() {
        use base64::Engine;
        let encoded = elevated_command(
            "param($Vid)\nexit 0",
            Path::new(r"C:\o'neil\s.log"),
            0x222A,
            0x1,
        );
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(&encoded)
            .unwrap();
        let units: Vec<u16> = bytes
            .chunks(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        assert_eq!(
            String::from_utf16(&units).unwrap(),
            "& {\nparam($Vid)\nexit 0\n} -Vid '222A' -ProductId '0001' -Log 'C:\\o''neil\\s.log'"
        );
    }

    #[test]
    fn the_launcher_elevates_the_encoded_command_and_maps_a_declined_prompt() {
        let t = launcher_text("QUJD");
        assert!(t.contains("-Verb RunAs"), "{t}");
        assert!(t.contains("'-EncodedCommand','QUJD'"), "{t}");
        assert!(t.contains("catch { exit 1223 }"), "{t}");
    }

    #[test]
    fn the_whole_command_fits_a_windows_command_line() {
        let encoded = elevated_command(
            include_str!("uninstall-winusb.ps1"),
            Path::new(r"C:\x\s.log"),
            1,
            1,
        );
        assert!(launcher_text(&encoded).len() < 32_000);
    }

    #[test]
    fn quotes_survive_powershell_strings() {
        assert_eq!(ps_quote(r"C:\Users\o'neil\x"), r"'C:\Users\o''neil\x'");
    }
}
