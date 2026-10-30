// Kiosk view: the main window takes the shown profile's exact size (frameless, no minimum) and,
// when it leaves, goes back to the geometry the studio had.

use crate::state::{lock, AppState};
use crate::windows;
use serde::Deserialize;
use tauri::{AppHandle, LogicalSize, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};

/// The studio window's least size (`create_main`'s).
const MIN_WIDTH: f64 = 960.0;
const MIN_HEIGHT: f64 = 600.0;
/// The largest side a profile can ask for.
const MAX_SIDE: f64 = 16384.0;

/// The size Kiosk view asks for, in logical pixels.
#[derive(Debug, Clone, Copy, Deserialize)]
pub struct KioskSize {
    pub width: f64,
    pub height: f64,
}

/// The studio's window geometry, kept while Kiosk view is on.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Saved {
    pub position: PhysicalPosition<i32>,
    pub size: PhysicalSize<u32>,
    pub maximized: bool,
}

/// The size when both sides are within 1..=16384 (the owner chose exact, even past the screen).
pub fn validate(size: KioskSize) -> Result<(f64, f64), String> {
    let ok = |side: f64| side.is_finite() && (1.0..=MAX_SIDE).contains(&side);
    if ok(size.width) && ok(size.height) {
        Ok((size.width, size.height))
    } else {
        Err(format!(
            "The Kiosk view size must be 1 to {MAX_SIDE} pixels a side."
        ))
    }
}

/// Stores `make()` unless something is stored already: a second enter keeps the studio's
/// geometry. Returns whether it stored.
pub fn remember_once<T>(slot: &mut Option<T>, make: impl FnOnce() -> T) -> bool {
    if slot.is_some() {
        return false;
    }
    *slot = Some(make());
    true
}

/// The window's logical size for a page viewport of `size`: the app zoom shrinks the viewport, so
/// the window grows by it.
pub fn scaled((width, height): (f64, f64), zoom: f64) -> (f64, f64) {
    (width * zoom, height * zoom)
}

fn current(window: &WebviewWindow) -> Result<Saved, String> {
    Ok(Saved {
        position: window.outer_position().map_err(|e| e.to_string())?,
        size: window.inner_size().map_err(|e| e.to_string())?,
        maximized: window.is_maximized().map_err(|e| e.to_string())?,
    })
}

/// Puts the window back to the remembered studio geometry; nothing to do when not in Kiosk view.
pub fn leave(app: &AppHandle) -> Result<(), String> {
    let Some(window) = app.get_webview_window(windows::MAIN) else {
        return Ok(());
    };
    let Some(saved) = lock(&app.state::<AppState>().kiosk).take() else {
        return Ok(());
    };
    let err = |e: tauri::Error| e.to_string();
    window
        .set_min_size(Some(LogicalSize::new(MIN_WIDTH, MIN_HEIGHT)))
        .map_err(err)?;
    // Position first: a move to another monitor can change the DPI scale, which would rescale a size set before it.
    window.set_position(saved.position).map_err(err)?;
    window.set_size(saved.size).map_err(err)?;
    if saved.maximized {
        window.maximize().map_err(err)?;
    }
    Ok(())
}

/// Takes the exact `size`, remembering the studio's geometry the first time.
pub fn enter(app: &AppHandle, size: KioskSize) -> Result<(), String> {
    let (width, height) = validate(size)?;
    let window = app
        .get_webview_window(windows::MAIN)
        .ok_or("The studio window is not open.")?;
    let err = |e: tauri::Error| e.to_string();
    // Unmaximize before reading the geometry, so what is remembered is the normal one.
    let maximized = window.is_maximized().map_err(err)?;
    if maximized {
        window.unmaximize().map_err(err)?;
    }
    let saved = Saved {
        maximized,
        ..current(&window)?
    };
    remember_once(&mut *lock(&app.state::<AppState>().kiosk), || saved);
    window.set_min_size(None::<LogicalSize<f64>>).map_err(err)?;
    let (width, height) = scaled((width, height), windows::zoom_factor(app));
    window
        .set_size(LogicalSize::new(width, height))
        .map_err(err)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn size(width: f64, height: f64) -> KioskSize {
        KioskSize { width, height }
    }

    #[test]
    fn sizes_are_one_to_sixteen_thousand_a_side() {
        assert_eq!(validate(size(1920.0, 550.0)), Ok((1920.0, 550.0)));
        assert_eq!(validate(size(1.0, 16384.0)), Ok((1.0, 16384.0)));
        // Larger than any screen is allowed; it is the owner's choice.
        assert!(validate(size(8000.0, 4000.0)).is_ok());
        for (w, h) in [
            (0.0, 600.0),
            (800.0, 0.0),
            (-5.0, 600.0),
            (16385.0, 600.0),
            (800.0, 16385.0),
            (f64::NAN, 600.0),
            (800.0, f64::INFINITY),
        ] {
            assert!(validate(size(w, h)).is_err(), "{w}x{h}");
        }
    }

    #[test]
    fn the_window_grows_by_the_app_zoom() {
        assert_eq!(scaled((1920.0, 550.0), 1.0), (1920.0, 550.0));
        assert_eq!(scaled((800.0, 400.0), 1.25), (1000.0, 500.0));
        assert_eq!(scaled((1000.0, 500.0), 0.8), (800.0, 400.0));
    }

    #[test]
    fn the_studio_geometry_is_remembered_once() {
        let mut slot = None;
        assert!(remember_once(&mut slot, || "studio"));
        // A second enter (already in Kiosk view) must not overwrite it with the kiosk's own.
        assert!(!remember_once(&mut slot, || "kiosk"));
        assert_eq!(slot, Some("studio"));
        // Leaving takes it; the next enter remembers again.
        assert_eq!(slot.take(), Some("studio"));
        assert!(remember_once(&mut slot, || "studio again"));
        assert_eq!(slot, Some("studio again"));
    }
}
