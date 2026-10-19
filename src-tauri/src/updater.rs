// In-app updates: look for a newer release, and install it after stopping the app's server (the
// installer replaces node.exe and the server files, which the server process holds open).

use crate::state::lock;
use crate::{control, tray};
use serde::Serialize;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

/// How long after launch the background check runs.
const STARTUP_DELAY: Duration = Duration::from_secs(15);

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub notes: Option<String>,
    pub date: Option<String>,
}

/// The update the last check found; `install` uses it.
#[derive(Default)]
pub struct Pending(Mutex<Option<Update>>);

fn info(update: &Update) -> UpdateInfo {
    UpdateInfo {
        version: update.version.clone(),
        notes: update.body.clone().filter(|b| !b.trim().is_empty()),
        date: update.date.map(|d| d.to_string()),
    }
}

/// Asks the release endpoint for a newer version and remembers it for `install`.
pub async fn check(app: &AppHandle) -> Result<Option<UpdateInfo>, String> {
    let found = app
        .updater()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?;
    let result = found.as_ref().map(info);
    match &result {
        Some(i) => log::info!("update available: {}", i.version),
        None => log::info!("no update available"),
    }
    tray::set_update(app, result.as_ref().map(|i| i.version.as_str()));
    *lock(&app.state::<Pending>().0) = found;
    Ok(result)
}

/// The update an earlier check found, for a page opened afterwards.
pub fn pending(app: &AppHandle) -> Option<UpdateInfo> {
    lock(&app.state::<Pending>().0).as_ref().map(info)
}

/// Downloads the pending update, stops the server, then runs the installer. On Windows the
/// passive installer closes the app and starts the new version. A failure brings the server back.
pub async fn install(app: &AppHandle) -> Result<(), String> {
    let update = lock(&app.state::<Pending>().0)
        .clone()
        .ok_or("There is no update to install. Check for updates first.")?;
    log::info!("downloading update {}", update.version);
    // Download first so the server only goes down for the install itself.
    let bytes = update.download(|_, _| {}, || {}).await.map_err(|e| {
        log::warn!("update download failed: {e}");
        e.to_string()
    })?;
    log::info!("installing update {}", update.version);
    control::stop_owned(app);
    if let Err(e) = update.install(bytes) {
        log::warn!("update install failed: {e}");
        control::start(app);
        return Err(e.to_string());
    }
    Ok(())
}

/// One check shortly after launch, in the background. A network failure is only logged.
pub fn check_soon(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(STARTUP_DELAY);
        if let Err(e) = tauri::async_runtime::block_on(check(&app)) {
            log::info!("update check failed: {e}");
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn info_serializes_camel_case() {
        let v = serde_json::to_value(UpdateInfo {
            version: "1.2.0".into(),
            notes: None,
            date: Some("2026-01-01".into()),
        })
        .unwrap();
        assert_eq!(v["version"], "1.2.0");
        assert_eq!(v["notes"], serde_json::Value::Null);
        assert_eq!(v["date"], "2026-01-01");
    }
}
