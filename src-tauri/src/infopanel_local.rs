// InfoPanel on this PC, for the first-run setup's checks: its data folder and profiles, the Data API switch in its
// settings.xml, the running InfoPanel.exe and its version, and starting or restarting it.
//
// The data folder is the import code's (INFOPANEL_DATA_DIR, else %LOCALAPPDATA%\InfoPanel), read-only. InfoPanel saves
// its settings with XmlSerializer: `<DataApi>`, `<DataApiListenIp>` and `<DataApiListenPort>` (Models/Settings.cs).
// A build without the Data API has no `<DataApi>` element at all.
//
// The exe: the running process's, else the installer's uninstall key, else its Start-menu shortcut. InfoPanel asks to
// run as administrator, so it is started through the shell (which shows the UAC prompt), and Restart only asks it to
// close (`taskkill` without /F): Studio never forces it. INFOPANEL_EXE points all of this at another exe (the tests' dummy).

use crate::probe::{self, ProcessInfo};
use crate::server_log::hidden_command;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, UNIX_EPOCH};

/// What InfoPanel's installer registers itself as (InnoSetup/setup.iss `AppId`, with Inno's `_is1`).
const UNINSTALL_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\{761BE813-4A06-4646-B930-3E647446A307}_is1";
const UNINSTALL_KEY_32: &str = r"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\{761BE813-4A06-4646-B930-3E647446A307}_is1";
const EXE_NAME: &str = "InfoPanel.exe";
/// How long Restart waits for InfoPanel to close before it gives up.
const CLOSE_WAIT: Duration = Duration::from_secs(10);

/// The Data API part of settings.xml.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataApi {
    pub enabled: bool,
    pub address: String,
    pub port: u16,
}

/// A profile in InfoPanel's data folder: its name, its items file and when that was last saved.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileFile {
    pub guid: String,
    pub name: String,
    pub file: String,
    pub bytes: u64,
    /// ms since the epoch; 0 when unknown.
    pub modified: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Running {
    pub pid: u32,
    pub exe: Option<String>,
}

/// Everything the checks read of InfoPanel on this PC, in one go.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Local {
    pub data_dir: String,
    /// settings.xml is there.
    pub settings: bool,
    /// The Data API switch; None when settings.xml has none (or isn't there).
    pub data_api: Option<DataApi>,
    pub profiles: Vec<ProfileFile>,
    pub process: Option<Running>,
    /// The exe Start would launch (or its shortcut); None when Studio can't find one.
    pub exe: Option<String>,
    /// The exe's file version, e.g. "1.4.0".
    pub version: Option<String>,
}

/// INFOPANEL_DATA_DIR, else `%LOCALAPPDATA%\InfoPanel` (ips-server's `infopanel_dir`).
pub fn data_dir() -> PathBuf {
    ips_server::env::infopanel_dir()
}

fn env_exe() -> Option<PathBuf> {
    std::env::var_os("INFOPANEL_EXE").filter(|v| !v.is_empty()).map(PathBuf::from)
}

/// The image name the process check looks for.
fn exe_name() -> String {
    env_exe()
        .and_then(|p| p.file_name().map(|n| n.to_string_lossy().into_owned()))
        .unwrap_or_else(|| EXE_NAME.into())
}

/// The text of `<name>…</name>`; "" for `<name />`; None when there is no such element.
fn element<'a>(xml: &'a str, name: &str) -> Option<&'a str> {
    let open = format!("<{name}>");
    if let Some(at) = xml.find(&open) {
        let start = at + open.len();
        let end = xml[start..].find(&format!("</{name}>"))?;
        return Some(&xml[start..start + end]);
    }
    [format!("<{name} />"), format!("<{name}/>")].iter().any(|e| xml.contains(e.as_str())).then_some("")
}

/// The Data API switch, address and port; None when the settings have no switch (an InfoPanel without the Data API).
pub fn parse_settings(xml: &str) -> Option<DataApi> {
    let enabled = element(xml, "DataApi")?.trim().eq_ignore_ascii_case("true");
    let address = element(xml, "DataApiListenIp").map(str::trim).filter(|a| !a.is_empty()).unwrap_or("127.0.0.1");
    let port = element(xml, "DataApiListenPort").and_then(|p| p.trim().parse().ok()).unwrap_or(3921);
    Some(DataApi { enabled, address: address.to_string(), port })
}

fn profiles(dir: &Path) -> Vec<ProfileFile> {
    let Ok(bytes) = std::fs::read(dir.join("profiles.xml")) else {
        return Vec::new();
    };
    ips_server::infopanel_local::profiles_from_xml(&String::from_utf8_lossy(&bytes))
        .into_iter()
        .map(|p| {
            let file = format!("{}.xml", p.guid);
            let meta = std::fs::metadata(dir.join("profiles").join(&file)).ok();
            let modified = meta
                .as_ref()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map_or(0, |d| d.as_millis() as u64);
            ProfileFile { guid: p.guid, name: p.name, file, bytes: meta.map_or(0, |m| m.len()), modified }
        })
        .collect()
}

/// Of the processes with InfoPanel's name, the main one: InfoPanel's own children share its name, so it is the one
/// whose parent isn't one of them (the lowest pid when that leaves several).
pub fn main_process(found: &[(u32, Option<u32>)]) -> Option<u32> {
    let ours = |pid: u32| found.iter().any(|(p, _)| *p == pid);
    found.iter().filter(|(_, parent)| !parent.is_some_and(ours)).map(|(pid, _)| *pid).min()
}

fn running(name: &str) -> Option<Running> {
    use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};
    let mut sys = System::new();
    sys.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing().with_exe(UpdateKind::OnlyIfNotSet));
    let found: Vec<(u32, Option<u32>)> = sys
        .processes()
        .values()
        .filter(|p| p.name().to_string_lossy().eq_ignore_ascii_case(name))
        .map(|p| (p.pid().as_u32(), p.parent().map(|pp| pp.as_u32())))
        .collect();
    let pid = main_process(&found)?;
    let exe = sys.process(sysinfo::Pid::from_u32(pid)).and_then(|p| p.exe()).map(|e| e.to_string_lossy().into_owned());
    Some(Running { pid, exe })
}

/// The first of the places InfoPanel can be started from that exists: the running exe, the installed one, the
/// Start-menu shortcut.
pub fn launcher(candidates: &[Option<PathBuf>]) -> Option<PathBuf> {
    candidates.iter().flatten().find(|p| p.is_file()).cloned()
}

#[cfg(windows)]
fn installed_exe() -> Option<PathBuf> {
    use crate::studio_target::registry::{string, HKCU, HKLM};
    [(HKCU, UNINSTALL_KEY), (HKLM, UNINSTALL_KEY), (HKLM, UNINSTALL_KEY_32)]
        .into_iter()
        .find_map(|(root, key)| string(root, key, Some("InstallLocation")))
        .map(|dir| PathBuf::from(dir).join(EXE_NAME))
}

#[cfg(not(windows))]
fn installed_exe() -> Option<PathBuf> {
    None
}

fn start_menu_shortcut() -> Vec<Option<PathBuf>> {
    let under = |var: &str| std::env::var_os(var).map(|d| PathBuf::from(d).join(r"Microsoft\Windows\Start Menu\Programs\InfoPanel\InfoPanel.lnk"));
    vec![under("APPDATA"), under("ProgramData")]
}

/// Where Start launches InfoPanel from; `running_exe` is the running process's, when there is one.
fn find_launcher(running_exe: Option<&str>) -> Option<PathBuf> {
    if let Some(exe) = env_exe() {
        return launcher(&[Some(exe)]);
    }
    let mut candidates = vec![running_exe.map(PathBuf::from), installed_exe()];
    candidates.extend(start_menu_shortcut());
    launcher(&candidates)
}

/// "major.minor.patch" from the exe's version resource.
#[cfg(windows)]
fn file_version(path: &Path) -> Option<String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{GetFileVersionInfoSizeW, GetFileVersionInfoW, VerQueryValueW, VS_FIXEDFILEINFO};
    let wide: Vec<u16> = path.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
    // SAFETY: a NUL-terminated path; the buffer is the size the first call reports.
    let size = unsafe { GetFileVersionInfoSizeW(wide.as_ptr(), std::ptr::null_mut()) };
    if size == 0 {
        return None;
    }
    let mut buf = vec![0u8; size as usize];
    if unsafe { GetFileVersionInfoW(wide.as_ptr(), 0, size, buf.as_mut_ptr().cast()) } == 0 {
        return None;
    }
    let mut info: *mut core::ffi::c_void = std::ptr::null_mut();
    let mut len = 0u32;
    let root = [u16::from(b'\\'), 0];
    // SAFETY: `info` points into `buf`, which outlives the read.
    if unsafe { VerQueryValueW(buf.as_ptr().cast(), root.as_ptr(), &mut info, &mut len) } == 0 || info.is_null() {
        return None;
    }
    let fixed = unsafe { &*(info as *const VS_FIXEDFILEINFO) };
    let (ms, ls) = (fixed.dwFileVersionMS, fixed.dwFileVersionLS);
    Some(format!("{}.{}.{}", ms >> 16, ms & 0xffff, ls >> 16))
}

#[cfg(not(windows))]
fn file_version(_: &Path) -> Option<String> {
    None
}

/// The checks' reading of InfoPanel on this PC.
pub fn local() -> Local {
    let dir = data_dir();
    let xml = std::fs::read(dir.join("settings.xml")).ok().map(|b| String::from_utf8_lossy(&b).into_owned());
    let process = running(&exe_name());
    let exe = find_launcher(process.as_ref().and_then(|p| p.exe.as_deref()));
    let version = exe.as_deref().filter(|p| p.extension().is_some_and(|e| e.eq_ignore_ascii_case("exe"))).and_then(file_version);
    Local {
        data_dir: dir.to_string_lossy().into_owned(),
        settings: xml.is_some(),
        data_api: xml.as_deref().and_then(parse_settings),
        profiles: profiles(&dir),
        process,
        exe: exe.map(|p| p.to_string_lossy().into_owned()),
        version,
    }
}

/// Opens InfoPanel through the shell (the UAC prompt, a shortcut). A second start brings a running InfoPanel's window
/// to the front (it is single-instance), which is what "Open InfoPanel" uses.
pub fn start(open: impl FnOnce(&Path) -> Result<(), String>) -> Result<(), String> {
    let running_exe = running(&exe_name()).and_then(|r| r.exe);
    let target = find_launcher(running_exe.as_deref()).ok_or("Studio can't find InfoPanel on this PC.")?;
    open(&target)
}

/// Asks the process to close (no /F) and waits for it; an error when it is still there after `wait`.
pub fn close(pid: u32, wait: Duration) -> Result<(), String> {
    let _ = hidden_command("taskkill").args(["/PID", &pid.to_string()]).output();
    let deadline = Instant::now() + wait;
    while Instant::now() < deadline {
        if probe::process_info(pid).is_none() {
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    Err("InfoPanel didn't close.".into())
}

/// Closes InfoPanel when it runs, then starts it again from the same exe.
pub fn restart(open: impl FnOnce(&Path) -> Result<(), String>) -> Result<(), String> {
    let name = exe_name();
    let found = running(&name);
    let target = find_launcher(found.as_ref().and_then(|r| r.exe.as_deref())).ok_or("Studio can't find InfoPanel on this PC.")?;
    if let Some(r) = found {
        close(r.pid, CLOSE_WAIT)?;
    }
    open(&target)
}

/// The process listening on `port`, when one is.
pub fn port_owner(port: u16) -> Option<ProcessInfo> {
    probe::listener_pid(port).and_then(probe::process_info)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SETTINGS: &str = r#"<?xml version="1.0" encoding="utf-8"?>
<Settings xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <WebServer>true</WebServer>
  <WebServerListenIp>127.0.0.1</WebServerListenIp>
  <WebServerListenPort>80</WebServerListenPort>
  <DataApi>true</DataApi>
  <DataApiListenIp>192.168.1.40</DataApiListenIp>
  <DataApiListenPort>3930</DataApiListenPort>
  <Version>131</Version>
</Settings>"#;

    #[test]
    fn reads_the_data_api_switch_address_and_port() {
        assert_eq!(parse_settings(SETTINGS), Some(DataApi { enabled: true, address: "192.168.1.40".into(), port: 3930 }));
    }

    #[test]
    fn a_switch_that_is_off_keeps_its_address() {
        let off = SETTINGS.replace("<DataApi>true</DataApi>", "<DataApi>false</DataApi>");
        assert_eq!(parse_settings(&off), Some(DataApi { enabled: false, address: "192.168.1.40".into(), port: 3930 }));
    }

    #[test]
    fn settings_without_the_switch_have_no_data_api() {
        // An InfoPanel without the Data API: the web server's elements must not be taken for it.
        let old = SETTINGS.lines().filter(|l| !l.contains("<DataApi")).collect::<Vec<_>>().join("\n");
        assert_eq!(parse_settings(&old), None);
        assert_eq!(parse_settings(""), None);
    }

    #[test]
    fn a_missing_or_empty_address_or_port_takes_infopanels_defaults() {
        let bare = "<Settings><DataApi>false</DataApi><DataApiListenIp /><DataApiListenPort>port</DataApiListenPort></Settings>";
        assert_eq!(parse_settings(bare), Some(DataApi { enabled: false, address: "127.0.0.1".into(), port: 3921 }));
        assert_eq!(parse_settings("<Settings><DataApi>True</DataApi></Settings>").map(|d| (d.enabled, d.port)), Some((true, 3921)));
    }

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ips-infopanel-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn lists_the_profiles_with_their_files() {
        let dir = scratch("profiles");
        let g = "70538526-f13f-4074-bb42-f6892d6e42d4";
        std::fs::write(dir.join("profiles.xml"), format!("<ArrayOfProfile><Profile><Guid>{g}</Guid><Name>Desk</Name></Profile></ArrayOfProfile>")).unwrap();
        std::fs::create_dir(dir.join("profiles")).unwrap();
        std::fs::write(dir.join("profiles").join(format!("{g}.xml")), "<ArrayOfDisplayItem/>").unwrap();
        let found = profiles(&dir);
        assert_eq!(found.len(), 1);
        assert_eq!((found[0].name.as_str(), found[0].file.as_str(), found[0].bytes), ("Desk", &*format!("{g}.xml"), 21));
        assert!(found[0].modified > 0);
        assert!(profiles(&dir.join("nowhere")).is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_main_process_is_the_one_not_started_by_another() {
        // InfoPanel (40) with two children of its own, under explorer (1).
        assert_eq!(main_process(&[(52, Some(40)), (40, Some(1)), (61, Some(40))]), Some(40));
        assert_eq!(main_process(&[(70, None), (30, Some(9))]), Some(30));
        assert_eq!(main_process(&[]), None);
    }

    #[test]
    fn starts_from_the_first_place_that_exists() {
        let dir = scratch("launcher");
        let installed = dir.join("InfoPanel.exe");
        let shortcut = dir.join("InfoPanel.lnk");
        std::fs::write(&installed, "").unwrap();
        std::fs::write(&shortcut, "").unwrap();
        let gone = Some(dir.join("gone").join("InfoPanel.exe"));
        assert_eq!(launcher(&[gone.clone(), Some(installed.clone()), Some(shortcut.clone())]), Some(installed));
        assert_eq!(launcher(&[None, gone.clone(), Some(shortcut.clone())]), Some(shortcut));
        assert_eq!(launcher(&[None, gone]), None);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn close_never_forces_a_process_that_does_not_close() {
        // A console process has no window to close: taskkill without /F leaves it running, and close says so.
        let mut child = std::process::Command::new("cmd").args(["/C", "ping -n 6 127.0.0.1 >NUL"]).spawn().expect("spawn");
        let result = close(child.id(), Duration::from_millis(800));
        let alive = probe::process_info(child.id()).is_some();
        let _ = child.kill();
        let _ = child.wait();
        assert!(result.is_err());
        assert!(alive, "the process was forced to close");
    }

    /// The start and restart path against a dummy InfoPanel (a small window app), never the real one: run with
    /// INFOPANEL_EXE set to the dummy's path and `cargo test -- --ignored restarts_the_dummy`.
    #[test]
    #[ignore]
    fn restarts_the_dummy() {
        let exe = env_exe().expect("INFOPANEL_EXE");
        assert_ne!(exe_name().to_ascii_lowercase(), "infopanel.exe", "point INFOPANEL_EXE at a dummy, never InfoPanel");
        let spawn = |p: &Path| std::process::Command::new(p).spawn().map(|_| ()).map_err(|e| e.to_string());
        start(spawn).unwrap();
        std::thread::sleep(Duration::from_secs(2));
        let first = running(&exe_name()).expect("the dummy started");
        restart(spawn).unwrap();
        std::thread::sleep(Duration::from_secs(2));
        let second = running(&exe_name()).expect("the dummy started again");
        assert_ne!(first.pid, second.pid);
        assert_eq!(second.exe.map(PathBuf::from), Some(exe));
        close(second.pid, CLOSE_WAIT).unwrap();
    }
}
