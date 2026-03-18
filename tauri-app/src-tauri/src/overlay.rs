use crate::config::AppConfig;
use crate::models::OverlayLayout;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

pub fn create_overlay(app: &AppHandle, config: &AppConfig) -> Result<(), String> {
    // Close existing overlay if present
    if let Some(window) = app.get_webview_window("overlay") {
        let _ = window.close();
    }

    let (width, height) = match config.overlay_layout {
        OverlayLayout::Compact => (300.0, 48.0),
        OverlayLayout::Minimal => (220.0, 40.0),
        OverlayLayout::Sidebar => (120.0, 300.0),
    };

    let (x, y) = config
        .overlay_position
        .as_ref()
        .map(|p| (p.x, p.y))
        .unwrap_or((100.0, 100.0));

    let _window = WebviewWindowBuilder::new(app, "overlay", WebviewUrl::App("overlay.html".into()))
        .title("ClaudeUsage Overlay")
        .inner_size(width, height)
        .position(x, y)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .build()
        .map_err(|e| format!("Failed to create overlay window: {}", e))?;

    Ok(())
}

pub fn close_overlay(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("overlay") {
        let _ = window.close();
    }
}
