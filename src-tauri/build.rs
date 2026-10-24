// The app commands get generated `allow-<command>` permissions, so every command is gated by a
// capability: the local pages' default.json, and the studio's and the settings window's runtime
// capabilities on the server's origin (src/control.rs).
fn main() {
    println!("cargo:rustc-env=BUILD_DATE={}", build_date());
    let manifest = tauri_build::AppManifest::new().commands(&[
        "get_settings",
        "set_setting",
        "set_zoom",
        "server_status",
        "start_server",
        "stop_server",
        "restart_server",
        "find_free_port",
        "server_stats",
        "use_foreign_server",
        "foreign_server_info",
        "open_studio",
        "open_logs_folder",
        "read_log_tail",
        "read_log",
        "reveal_path",
        "get_diagnostics",
        "set_agents",
        "agents_status",
        "repair_agents",
        "open_agent_backups",
        "open_devtools",
        "open_webview_task_manager",
        "list_local_addresses",
        "quit_app",
        "open_settings",
        "show_studio",
        "open_help",
        "kiosk_window",
        "save_text_file",
        "save_binary_file",
        "open_text_file",
        "log_frontend",
        "report_metrics",
        "get_debug",
        "flush_done",
        "update_state",
        "check_for_update",
        "download_update",
        "cancel_update",
        "install_update",
        "app_info",
        "changelog",
        "open_external",
        "default_browser_kind",
    ]);
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(manifest))
        .expect("failed to run the Tauri build script");
}

/// Today (UTC) as YYYY-MM-DD, for the About page's "built" date.
fn build_date() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // Howard Hinnant's days-to-civil.
    let z = (secs / 86_400) as i64 + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!("{year:04}-{month:02}-{day:02}")
}
