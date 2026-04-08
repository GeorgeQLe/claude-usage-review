use crate::api;
use crate::config;
use crate::credentials;
use crate::models::*;
use crate::overlay;
use crate::state::{self, AppState};
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};
use tokio::sync::Mutex;
use uuid::Uuid;

type SharedState = Arc<Mutex<AppState>>;

fn restart_polling(app: AppHandle, state: &State<'_, SharedState>) {
    state::start_polling(app, state.inner().clone());
}

#[tauri::command]
pub async fn get_usage(state: State<'_, SharedState>) -> Result<UsageState, String> {
    let s = state.lock().await;
    Ok(s.compute_usage_state())
}

#[tauri::command]
pub async fn refresh_now(
    app: AppHandle,
    state: State<'_, SharedState>,
) -> Result<UsageState, String> {
    let (session_key, org_id, account_id, http_client) = {
        let s = state.lock().await;
        let id = s
            .config
            .active_account_id
            .ok_or("No active account")?;
        let acct = s
            .config
            .accounts
            .iter()
            .find(|a| a.id == id)
            .ok_or("Account not found")?;
        let org = acct.org_id.clone().ok_or("No org ID configured")?;
        let key =
            credentials::read_session_key(&id).ok_or("No session key found")?;
        let client = s.http_client.clone();
        (key, org, id, client)
    };

    match api::fetch_usage(&http_client, &session_key, &org_id).await {
        Ok(result) => {
            let mut s = state.lock().await;
            if let Some(ref new_key) = result.new_session_key {
                let _ = credentials::save_session_key(&account_id, new_key);
            }
            s.usage_data = Some(result.data);
            s.last_updated = Some(chrono::Utc::now());
            s.error_state = None;
            s.auth_status = AuthStatus::Connected;

            // Update tray
            if let Some(tray) = app.tray_by_id("main-tray") {
                let usage_state = s.compute_usage_state();
                let _ = tray.set_tooltip(Some(&usage_state.menu_bar_text));
            }

            Ok(s.compute_usage_state())
        }
        Err(api::ApiError::AuthError { .. }) => {
            let mut s = state.lock().await;
            s.error_state = Some(ErrorState::AuthExpired);
            s.auth_status = AuthStatus::Expired;
            Ok(s.compute_usage_state())
        }
        Err(e) => {
            let mut s = state.lock().await;
            s.error_state = Some(ErrorState::NetworkError);
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub async fn get_accounts(state: State<'_, SharedState>) -> Result<Vec<AccountInfo>, String> {
    let s = state.lock().await;
    Ok(s.compute_usage_state().accounts)
}

#[tauri::command]
pub async fn add_account(
    state: State<'_, SharedState>,
    name: String,
) -> Result<AccountInfo, String> {
    let mut s = state.lock().await;
    let id = Uuid::new_v4();
    let account = AccountMetadata {
        id,
        name: name.clone(),
        org_id: None,
    };
    s.config.accounts.push(account);
    if s.config.active_account_id.is_none() {
        s.config.active_account_id = Some(id);
    }
    config::save_config(&s.config)?;

    Ok(AccountInfo {
        id: id.to_string(),
        name,
        is_configured: false,
        is_active: s.config.active_account_id == Some(id),
    })
}

#[tauri::command]
pub async fn remove_account(
    app: AppHandle,
    state: State<'_, SharedState>,
    account_id: String,
) -> Result<(), String> {
    let id: Uuid = account_id.parse().map_err(|_| "Invalid UUID")?;

    let mut s = state.lock().await;
    let _ = credentials::delete_session_key(&id);
    s.config.accounts.retain(|a| a.id != id);

    if s.config.active_account_id == Some(id) {
        s.config.active_account_id = s.config.accounts.first().map(|a| a.id);
        // Clear usage data when switching accounts
        s.usage_data = None;
        s.last_updated = None;
        s.error_state = None;
    }

    config::save_config(&s.config)?;

    // Restart polling if we switched to a new account
    drop(s);
    restart_polling(app, &state);

    Ok(())
}

#[tauri::command]
pub async fn rename_account(
    state: State<'_, SharedState>,
    account_id: String,
    new_name: String,
) -> Result<(), String> {
    let id: Uuid = account_id.parse().map_err(|_| "Invalid UUID")?;
    let mut s = state.lock().await;
    if let Some(acct) = s.config.accounts.iter_mut().find(|a| a.id == id) {
        acct.name = new_name;
    }
    config::save_config(&s.config)
}

#[tauri::command]
pub async fn set_active_account(
    app: AppHandle,
    state: State<'_, SharedState>,
    account_id: String,
) -> Result<(), String> {
    let id: Uuid = account_id.parse().map_err(|_| "Invalid UUID")?;
    let mut s = state.lock().await;
    if !s.config.accounts.iter().any(|a| a.id == id) {
        return Err("Account not found".to_string());
    }
    s.config.active_account_id = Some(id);
    s.usage_data = None;
    s.last_updated = None;
    s.error_state = None;
    config::save_config(&s.config)?;

    drop(s);
    restart_polling(app, &state);

    Ok(())
}

#[tauri::command]
pub async fn save_credentials(
    app: AppHandle,
    state: State<'_, SharedState>,
    account_id: String,
    session_key: String,
    org_id: String,
) -> Result<(), String> {
    let id: Uuid = account_id.parse().map_err(|_| "Invalid UUID")?;

    let mut s = state.lock().await;
    credentials::save_session_key(&id, &session_key)?;

    if let Some(acct) = s.config.accounts.iter_mut().find(|a| a.id == id) {
        acct.org_id = Some(org_id);
    }
    config::save_config(&s.config)?;

    drop(s);
    restart_polling(app, &state);

    Ok(())
}

#[tauri::command]
pub async fn test_connection(
    session_key: String,
    org_id: String,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    match api::fetch_usage(&client, &session_key, &org_id).await {
        Ok(_) => Ok("connected".to_string()),
        Err(api::ApiError::AuthError { .. }) => Ok("auth_error".to_string()),
        Err(e) => Ok(format!("error: {}", e)),
    }
}

#[tauri::command]
pub async fn get_config(state: State<'_, SharedState>) -> Result<serde_json::Value, String> {
    let s = state.lock().await;
    serde_json::to_value(&s.config).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_config(
    state: State<'_, SharedState>,
    key: String,
    value: serde_json::Value,
) -> Result<(), String> {
    let mut s = state.lock().await;
    match key.as_str() {
        "time_display_format" => {
            s.config.time_display_format = serde_json::from_value(value).map_err(|e| e.to_string())?;
        }
        "overlay_enabled" => {
            s.config.overlay_enabled = value.as_bool().ok_or("Expected boolean")?;
        }
        "overlay_layout" => {
            s.config.overlay_layout = serde_json::from_value(value).map_err(|e| e.to_string())?;
        }
        "overlay_opacity" => {
            s.config.overlay_opacity = value.as_f64().ok_or("Expected number")?;
        }
        _ => return Err(format!("Unknown config key: {}", key)),
    }
    config::save_config(&s.config)
}

#[tauri::command]
pub async fn toggle_overlay(
    app: AppHandle,
    state: State<'_, SharedState>,
) -> Result<bool, String> {
    let mut s = state.lock().await;
    s.config.overlay_enabled = !s.config.overlay_enabled;
    let enabled = s.config.overlay_enabled;
    config::save_config(&s.config)?;

    if enabled {
        overlay::create_overlay(&app, &s.config)?;
    } else {
        overlay::close_overlay(&app);
    }

    Ok(enabled)
}

#[tauri::command]
pub async fn set_overlay_layout(
    app: AppHandle,
    state: State<'_, SharedState>,
    layout: OverlayLayout,
) -> Result<(), String> {
    let mut s = state.lock().await;
    s.config.overlay_layout = layout;
    config::save_config(&s.config)?;

    if s.config.overlay_enabled {
        overlay::create_overlay(&app, &s.config)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn set_overlay_opacity(
    app: AppHandle,
    state: State<'_, SharedState>,
    opacity: f64,
) -> Result<(), String> {
    if opacity.is_nan() || opacity.is_infinite() {
        return Err("Opacity must be a finite number".to_string());
    }
    let opacity = opacity.clamp(0.0, 1.0);
    let mut s = state.lock().await;
    s.config.overlay_opacity = opacity;
    config::save_config(&s.config)?;

    // Apply opacity to existing overlay window
    if let Some(window) = app.get_webview_window("overlay") {
        let _ = window.eval(&format!("document.body.style.opacity = '{}'", opacity));
    }
    Ok(())
}

#[tauri::command]
pub async fn set_overlay_position(
    state: State<'_, SharedState>,
    x: f64,
    y: f64,
) -> Result<(), String> {
    let mut s = state.lock().await;
    s.config.overlay_position = Some(crate::models::OverlayPosition { x, y });
    config::save_config(&s.config)
}
