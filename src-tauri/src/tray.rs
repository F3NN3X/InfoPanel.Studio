// Tray icon: Open studio · Open kiosk in browser · Settings · Check for updates · Restart server · Quit.

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

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let update = MenuItem::with_id(app, "update", CHECK_LABEL, true, None::<&str>)?;
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
        }
    }

    #[test]
    fn update_label_names_the_version() {
        assert_eq!(update_label(None), "Check for updates…");
        assert_eq!(update_label(Some("1.2.0")), "Update to v1.2.0…");
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
    }
}
