mod api;
mod commands;
mod config;
mod credentials;
mod models;
mod overlay;
mod provider_types;
mod state;

use log::{error, info, warn};
use simplelog::{CombinedLogger, Config as LogConfig, LevelFilter, WriteLogger};
use state::AppState;
use std::fs;
use std::sync::Arc;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconEvent,
    Listener, Manager, WebviewUrl, WebviewWindowBuilder,
};
use tokio::sync::Mutex;

fn init_logging() {
    let log_dir = dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("ClaudeUsage");
    let _ = fs::create_dir_all(&log_dir);
    let log_file = log_dir.join("app.log");

    if let Ok(file) = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_file)
    {
        let _ = CombinedLogger::init(vec![WriteLogger::new(
            LevelFilter::Info,
            LogConfig::default(),
            file,
        )]);
    }
}

fn show_error_dialog(message: &str) {
    #[cfg(target_os = "windows")]
    {
        use std::ffi::OsStr;
        use std::iter::once;
        use std::os::windows::ffi::OsStrExt;
        use std::ptr::null_mut;

        extern "system" {
            fn MessageBoxW(hwnd: *mut u8, text: *const u16, caption: *const u16, flags: u32)
                -> i32;
        }

        let text: Vec<u16> = OsStr::new(message).encode_wide().chain(once(0)).collect();
        let caption: Vec<u16> = OsStr::new("ClaudeUsage Error")
            .encode_wide()
            .chain(once(0))
            .collect();
        unsafe {
            MessageBoxW(null_mut(), text.as_ptr(), caption.as_ptr(), 0x10); // MB_ICONERROR
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        eprintln!("ClaudeUsage Error: {}", message);
    }
}

fn toggle_popover(app: &tauri::AppHandle, tray_rect: tauri::Rect) {
    if let Some(window) = app.get_webview_window("popover") {
        let _ = window.close();
        return;
    }

    let popover_width = 280.0_f64;
    let popover_height = 400.0_f64;
    let margin = 8.0_f64;

    let scale_factor = app
        .primary_monitor()
        .ok()
        .flatten()
        .map(|m| m.scale_factor())
        .unwrap_or(1.0);

    // Convert tray rect to logical pixels
    let tray_pos: tauri::LogicalPosition<f64> = tray_rect.position.to_logical(scale_factor);
    let tray_size: tauri::LogicalSize<f64> = tray_rect.size.to_logical(scale_factor);

    // Screen bounds in logical pixels
    let (screen_w, screen_h) = app
        .primary_monitor()
        .ok()
        .flatten()
        .map(|m| {
            let size = m.size();
            (
                size.width as f64 / scale_factor,
                size.height as f64 / scale_factor,
            )
        })
        .unwrap_or((1920.0, 1080.0));

    // Center popover horizontally on tray icon
    let mut x = tray_pos.x + tray_size.width / 2.0 - popover_width / 2.0;
    // Position above tray icon (taskbar at bottom)
    let mut y = tray_pos.y - popover_height;

    // If popover would go above screen top, flip to below tray icon
    if y < margin {
        y = tray_pos.y + tray_size.height;
    }

    // Clamp to screen bounds with margin
    x = x.clamp(margin, screen_w - popover_width - margin);
    y = y.clamp(margin, screen_h - popover_height - margin);

    let _window = WebviewWindowBuilder::new(app, "popover", WebviewUrl::App("index.html".into()))
        .title("Claude Usage")
        .inner_size(popover_width, popover_height)
        .position(x, y)
        .decorations(false)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focused(true)
        .build();
}

#[derive(Debug, PartialEq, Eq)]
enum TrayMenuAction {
    RefreshNow,
    ToggleOverlay,
    OpenSettings,
    Exit,
}

fn tray_menu_action_for_id(id: &str) -> Option<TrayMenuAction> {
    match id {
        "refresh" => Some(TrayMenuAction::RefreshNow),
        "settings" => Some(TrayMenuAction::OpenSettings),
        "toggle_overlay" => Some(TrayMenuAction::ToggleOverlay),
        "quit" => Some(TrayMenuAction::Exit),
        _ => None,
    }
}

pub fn open_settings(app: &tauri::AppHandle) {
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
    init_logging();
    info!("ClaudeUsage starting up");

    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--autostarted"]),
        ))
        .setup(|app| {
            info!("Tauri setup phase starting");
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

            match app.tray_by_id("main-tray") {
                Some(tray) => {
                    info!("Tray icon created successfully");
                    tray.set_menu(Some(menu))?;

                    let app_handle = app.handle().clone();
                    tray.on_tray_icon_event(move |_tray, event| {
                        if let TrayIconEvent::Click { button, rect, .. } = event {
                            match button {
                                tauri::tray::MouseButton::Left => {
                                    toggle_popover(&app_handle, rect);
                                }
                                _ => {}
                            }
                        }
                    });

                    let app_handle2 = app.handle().clone();
                    let state_for_menu = state.clone();
                    tray.on_menu_event(move |_app, event| {
                        match tray_menu_action_for_id(event.id().as_ref()) {
                            Some(TrayMenuAction::RefreshNow) => {
                                let app_handle = app_handle2.clone();
                                let state = state_for_menu.clone();
                                tauri::async_runtime::spawn(async move {
                                    if let Err(err) = commands::refresh_now_action(app_handle, state).await {
                                        warn!("Tray refresh failed: {err}");
                                    }
                                });
                            }
                            Some(TrayMenuAction::ToggleOverlay) => {
                                let app_handle = app_handle2.clone();
                                let state = state_for_menu.clone();
                                tauri::async_runtime::spawn(async move {
                                    if let Err(err) = commands::toggle_overlay_action(app_handle, state).await {
                                        warn!("Tray overlay toggle failed: {err}");
                                    }
                                });
                            }
                            Some(TrayMenuAction::OpenSettings) => {
                                open_settings(&app_handle2);
                            }
                            Some(TrayMenuAction::Exit) => {
                                app_handle2.exit(0);
                            }
                            None => {}
                        }
                    });
                }
                None => {
                    warn!("Tray icon creation failed — opening settings window as fallback");
                    open_settings(app.handle());
                }
            }

            // Create overlay if enabled (BEFORE polling starts to avoid lock contention)
            {
                let state_blocking = state.try_lock().expect("state lock should be uncontested during setup");
                if state_blocking.config.overlay_enabled {
                    let _ = overlay::create_overlay(app.handle(), &state_blocking.config);
                }
            }

            // Start polling AFTER overlay setup — spawned task acquires the lock,
            // so it must not race with try_lock() above
            info!("Starting usage polling");
            let app_handle = app.handle().clone();
            let state_for_poll = state.clone();
            tauri::async_runtime::spawn(async move {
                state::start_polling(app_handle, state_for_poll).await;
            });

            // Close popover on focus loss
            let app_handle = app.handle().clone();
            app.listen("tauri://blur", move |_event| {
                if let Some(window) = app_handle.get_webview_window("popover") {
                    let _ = window.close();
                }
            });

            info!("Setup phase complete");
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
        .unwrap_or_else(|err| {
            let msg = format!("Failed to start ClaudeUsage: {err}");
            error!("{}", msg);
            show_error_dialog(&msg);
            std::process::exit(1);
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tray_refresh_menu_uses_backend_refresh_action() {
        assert_eq!(
            tray_menu_action_for_id("refresh"),
            Some(TrayMenuAction::RefreshNow)
        );
    }

    #[test]
    fn tray_toggle_overlay_menu_uses_backend_overlay_action() {
        assert_eq!(
            tray_menu_action_for_id("toggle_overlay"),
            Some(TrayMenuAction::ToggleOverlay)
        );
    }

    #[test]
    fn tray_menu_does_not_emit_unused_frontend_events() {
        let actions = ["refresh", "toggle_overlay"].map(tray_menu_action_for_id);

        assert!(
            actions
                .iter()
                .flatten()
                .all(|action| matches!(
                    action,
                    TrayMenuAction::RefreshNow | TrayMenuAction::ToggleOverlay
                ))
        );
    }
}
