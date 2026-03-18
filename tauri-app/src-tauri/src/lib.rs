mod api;
mod commands;
mod config;
mod credentials;
mod models;
mod overlay;
mod state;

use state::AppState;
use std::sync::Arc;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconEvent,
    Emitter, Listener, Manager, WebviewUrl, WebviewWindowBuilder,
};
use tokio::sync::Mutex;

fn toggle_popover(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("popover") {
        let _ = window.close();
        return;
    }

    let _window = WebviewWindowBuilder::new(app, "popover", WebviewUrl::App("index.html".into()))
        .title("Claude Usage")
        .inner_size(280.0, 400.0)
        .decorations(false)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focused(true)
        .build();
}

fn open_settings(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("settings") {
        let _ = window.set_focus();
        return;
    }

    let _window =
        WebviewWindowBuilder::new(app, "settings", WebviewUrl::App("settings.html".into()))
            .title("ClaudeUsage Settings")
            .inner_size(320.0, 520.0)
            .resizable(false)
            .center()
            .build();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--autostarted"]),
        ))
        .setup(|app| {
            let state = Arc::new(Mutex::new(AppState::new()));
            app.manage(state.clone());

            // Build context menu
            let refresh_item = MenuItemBuilder::with_id("refresh", "Refresh Now").build(app)?;
            let settings_item = MenuItemBuilder::with_id("settings", "Settings").build(app)?;
            let overlay_item =
                MenuItemBuilder::with_id("toggle_overlay", "Toggle Overlay").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

            let menu = MenuBuilder::new(app)
                .item(&refresh_item)
                .separator()
                .item(&settings_item)
                .item(&overlay_item)
                .separator()
                .item(&quit_item)
                .build()?;

            if let Some(tray) = app.tray_by_id("main-tray") {
                tray.set_menu(Some(menu))?;

                let app_handle = app.handle().clone();
                tray.on_tray_icon_event(move |_tray, event| {
                    if let TrayIconEvent::Click { button, .. } = event {
                        match button {
                            tauri::tray::MouseButton::Left => {
                                toggle_popover(&app_handle);
                            }
                            _ => {}
                        }
                    }
                });

                let app_handle2 = app.handle().clone();
                tray.on_menu_event(move |_app, event| match event.id().as_ref() {
                    "refresh" => {
                        // Trigger refresh via event
                        let _ = app_handle2.emit("trigger-refresh", ());
                    }
                    "settings" => {
                        open_settings(&app_handle2);
                    }
                    "toggle_overlay" => {
                        let _ = app_handle2.emit("trigger-toggle-overlay", ());
                    }
                    "quit" => {
                        app_handle2.exit(0);
                    }
                    _ => {}
                });
            }

            // Start polling
            let app_handle = app.handle().clone();
            state::start_polling(app_handle, state.clone());

            // Create overlay if enabled
            {
                let state_blocking = state.blocking_lock();
                if state_blocking.config.overlay_enabled {
                    let _ = overlay::create_overlay(app.handle(), &state_blocking.config);
                }
            }

            // Close popover on focus loss
            let app_handle = app.handle().clone();
            app.listen("tauri://blur", move |_event| {
                if let Some(window) = app_handle.get_webview_window("popover") {
                    let _ = window.close();
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_usage,
            commands::refresh_now,
            commands::get_accounts,
            commands::add_account,
            commands::remove_account,
            commands::rename_account,
            commands::set_active_account,
            commands::save_credentials,
            commands::test_connection,
            commands::get_config,
            commands::update_config,
            commands::toggle_overlay,
            commands::set_overlay_layout,
            commands::set_overlay_opacity,
            commands::set_overlay_position,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
