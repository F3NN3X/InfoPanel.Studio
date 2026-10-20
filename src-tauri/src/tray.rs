// Tray icon: Open studio · Open kiosk in browser · Settings · Check for updates · Start or stop
// server · Restart server · Quit.

use crate::state::{AppState, Phase, Status};
use crate::{control, windows};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Wry};
use tauri_plugin_opener::OpenerExt;

const TRAY: &str = "main";
const CHECK_LABEL: &str = "Check for updates…";

/// The menu entry that offers the update; kept so its text can follow the check.
struct UpdateItem(MenuItem<Wry>);

/// The Start / Stop server entry; its text follows the server state.
struct ServerItem(MenuItem<Wry>);

/// True while the app's own server is up or on its way, so the entry offers Stop. A server the
/// app did not start is never stopped from here.
fn server_is_up(state: Phase, owned: bool) -> bool {
    match state {
        Phase::Starting | Phase::Restarting => true,
        Phase::Running => owned,
        _ => false,
    }
}

/// The entry is off while a server the app did not start is in use: it is not the app's to stop,
/// and starting would take its port over.
fn server_toggle_enabled(state: Phase, owned: bool) -> bool {
    state != Phase::Running || owned
}

fn server_toggle_label(state: Phase, owned: bool) -> &'static str {
    if server_is_up(state, owned) {
        "Stop server"
    } else {
        "Start server"
    }
}

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let update = MenuItem::with_id(app, "update", CHECK_LABEL, true, None::<&str>)?;
    let status = app.state::<AppState>().status();
    let toggle = MenuItem::with_id(
        app,
        "server_toggle",
        server_toggle_label(status.state, status.owned),
        server_toggle_enabled(status.state, status.owned),
        None::<&str>,
    )?;
    let menu = Menu::with_items(
        app,
        &[
            &MenuItem::with_id(app, "open_studio", "Open studio", true, None::<&str>)?,
            &MenuItem::with_id(
                app,
                "open_kiosk",
                "Open kiosk in browser",
                true,
                None::<&str>,
            )?,
            &MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?,
            &update,
            &PredefinedMenuItem::separator(app)?,
            &toggle,
            &MenuItem::with_id(app, "restart", "Restart server", true, None::<&str>)?,
            &MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?,
        ],
    )?;
    let mut builder = TrayIconBuilder::with_id(TRAY)
        .tooltip("InfoPanel Studio")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            log::debug!("tray: {}", event.id.as_ref());
            match event.id.as_ref() {
                "open_studio" => windows::show_main(app),
                "open_kiosk" => {
                    let url = app.state::<AppState>().status().kiosk_url;
                    if let Err(e) = app.opener().open_url(url, None::<&str>) {
                        log::warn!("could not open the kiosk: {e}");
                    }
                }
                "settings" | "update" => windows::show_settings(app),
                "server_toggle" => {
                    let app = app.clone();
                    std::thread::spawn(move || {
                        let status = app.state::<AppState>().status();
                        if !server_toggle_enabled(status.state, status.owned) {
                            return;
                        }
                        if server_is_up(status.state, status.owned) {
                            let _ = control::stop(&app);
                        } else {
                            control::start_blocking(&app);
                        }
                    });
                }
                "restart" => control::restart(app),
                "quit" => {
                    let app = app.clone();
                    std::thread::spawn(move || windows::quit(&app));
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                windows::show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    app.manage(UpdateItem(update));
    app.manage(ServerItem(toggle));
    Ok(())
}

/// `Update to vX.Y.Z…` while an update waits, the plain check entry otherwise.
pub fn set_update(app: &AppHandle, version: Option<&str>) {
    if let Some(item) = app.try_state::<UpdateItem>() {
        let _ = item.0.set_text(update_label(version));
    }
}

fn update_label(version: Option<&str>) -> String {
    version.map_or_else(|| CHECK_LABEL.to_owned(), |v| format!("Update to v{v}…"))
}

pub fn tooltip(status: &Status) -> String {
    let address = format!("{}:{}", status.host, status.port);
    match status.state {
        Phase::Starting => format!("InfoPanel Studio: starting on {address}"),
        Phase::Running if status.owned => format!("InfoPanel Studio: running on {address}"),
        Phase::Running => format!("InfoPanel Studio: using another server on {address}"),
        Phase::Stopped => "InfoPanel Studio: server stopped".to_owned(),
        Phase::Restarting => format!("InfoPanel Studio: restarting on {address}"),
        _ => format!(
            "InfoPanel Studio: {}",
            status.message.as_deref().unwrap_or("server not running")
        ),
    }
}

pub fn update(app: &AppHandle, status: &Status) {
    if let Some(tray) = app.tray_by_id(TRAY) {
        // Windows caps tray tooltips at 127 characters.
        let text: String = tooltip(status).chars().take(127).collect();
        let _ = tray.set_tooltip(Some(text));
    }
    if let Some(item) = app.try_state::<ServerItem>() {
        let _ = item
            .0
            .set_text(server_toggle_label(status.state, status.owned));
        let _ = item
            .0
            .set_enabled(server_toggle_enabled(status.state, status.owned));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn status(state: Phase, owned: bool, message: Option<&str>) -> Status {
        Status {
            state,
            owned,
            host: "127.0.0.1".into(),
            port: 3942,
            origin: String::new(),
            studio_url: String::new(),
            kiosk_url: String::new(),
            message: message.map(str::to_owned),
            foreign_version: None,
            app_version: "1.0.0".into(),
            debug: false,
            pid: None,
            started_at: None,
            running_config: None,
            error_code: None,
            failed_at: None,
            suggested_port: None,
        }
    }

    #[test]
    fn update_label_names_the_version() {
        assert_eq!(update_label(None), "Check for updates…");
        assert_eq!(update_label(Some("1.2.0")), "Update to v1.2.0…");
    }

    #[test]
    fn server_entry_flips_with_the_state() {
        for up in [Phase::Starting, Phase::Running, Phase::Restarting] {
            assert_eq!(server_toggle_label(up, true), "Stop server");
        }
        // A server the app did not start is not the app's to stop.
        assert_eq!(server_toggle_label(Phase::Running, false), "Start server");
        assert!(!server_toggle_enabled(Phase::Running, false));
        assert!(server_toggle_enabled(Phase::Running, true));
        assert!(server_toggle_enabled(Phase::Failed, false));
        for down in [
            Phase::Stopped,
            Phase::Failed,
            Phase::PortInUse,
            Phase::ForeignDashboard,
        ] {
            assert_eq!(server_toggle_label(down, true), "Start server");
        }
    }

    #[test]
    fn tooltip_names_the_state() {
        assert_eq!(
            tooltip(&status(Phase::Running, true, None)),
            "InfoPanel Studio: running on 127.0.0.1:3942"
        );
        assert!(tooltip(&status(Phase::Running, false, None)).contains("another server"));
        assert_eq!(
            tooltip(&status(Phase::Failed, false, Some("crashed"))),
            "InfoPanel Studio: crashed"
        );
        assert_eq!(
            tooltip(&status(Phase::Stopped, false, None)),
            "InfoPanel Studio: server stopped"
        );
    }
}
