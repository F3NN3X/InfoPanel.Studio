// The app commands get generated `allow-<command>` permissions, so every command is gated by a
// capability: the local pages' default.json and the studio's runtime capability.
fn main() {
    let manifest = tauri_build::AppManifest::new().commands(&[
        "get_settings",
        "save_settings",
        "server_status",
        "restart_server",
        "use_foreign_server",
        "stop_foreign_server",
        "foreign_server_info",
        "open_studio",
        "open_logs_folder",
        "read_log_tail",
        "get_diagnostics",
        "set_agents",
        "open_devtools",
        "list_local_addresses",
        "quit_app",
        "open_settings",
        "save_text_file",
        "save_binary_file",
        "open_text_file",
        "log_frontend",
        "report_metrics",
        "get_debug",
        "flush_done",
        "check_for_update",
        "pending_update",
        "install_update",
    ]);
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(manifest))
        .expect("failed to run the Tauri build script");
}
