use crate::api;
use crate::config::{self, AppConfig};
use crate::credentials;
use crate::models::*;
use crate::provider_types::ProviderSnapshot;
use chrono::{DateTime, Local, Utc};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Mutex;
use tauri::async_runtime::JoinHandle;
use uuid::Uuid;

const POLLING_INTERVAL_SECS: u64 = 300;
const MAX_BACKOFF_SECS: u64 = 3600;
const SEVEN_DAY_WINDOW_SECS: f64 = 7.0 * 86400.0;

enum FetchOutcome {
    Success,
    AuthError,
    NetworkError,
}

pub struct AppState {
    pub config: AppConfig,
    pub http_client: reqwest::Client,
    pub usage_data: Option<UsageData>,
    pub last_updated: Option<DateTime<Utc>>,
    pub error_state: Option<ErrorState>,
    pub auth_status: AuthStatus,
    polling_handle: Option<JoinHandle<()>>,
}

impl AppState {
    pub fn new() -> Self {
        let config = config::load_config();
        let auth_status = if config.active_account_id.is_some() {
            let has_creds = config.active_account_id.and_then(|id| {
                let acct = config.accounts.iter().find(|a| a.id == id)?;
                if acct.org_id.is_some() && credentials::read_session_key(&id).is_some() {
                    Some(())
                } else {
                    None
                }
            });
            if has_creds.is_some() {
                AuthStatus::Connected
            } else {
                AuthStatus::NotConfigured
            }
        } else {
            AuthStatus::NotConfigured
        };

        Self {
            config,
            http_client: reqwest::Client::new(),
            usage_data: None,
            last_updated: None,
            error_state: None,
            auth_status,
            polling_handle: None,
        }
    }

    pub fn stop_polling(&mut self) {
        if let Some(handle) = self.polling_handle.take() {
            handle.abort();
        }
    }

    /// Compute the full usage state for the frontend
    pub fn compute_usage_state(&self) -> UsageState {
        let accounts: Vec<AccountInfo> = self
            .config
            .accounts
            .iter()
            .map(|a| AccountInfo {
                id: a.id.to_string(),
                name: a.name.clone(),
                is_configured: a.org_id.is_some()
                    && credentials::read_session_key(&a.id).is_some(),
                is_active: self.config.active_account_id == Some(a.id),
            })
            .collect();

        let (display_limits, highest, menu_text, tray_color, provider_cards) =
            if let Some(ref data) = self.usage_data {
                let limits = self.compute_display_limits(data);
                let highest = self.highest_utilization(data);
                let color = tray_color_for_utilization(highest);
                let menu_text = self.compute_menu_bar_text(data);
                let snapshot = ProviderSnapshot::ClaudeRich {
                    usage: data.clone(),
                    auth_status: self.auth_status.clone(),
                    is_enabled: true,
                };
                let cards = vec![snapshot.to_card()];
                (limits, highest, menu_text, color, Some(cards))
            } else if self.auth_status != AuthStatus::NotConfigured {
                let snapshot = ProviderSnapshot::ClaudeSimple { is_enabled: true };
                let cards = vec![snapshot.to_card()];
                (vec![], 0.0, "—".to_string(), "green".to_string(), Some(cards))
            } else {
                (vec![], 0.0, "—".to_string(), "green".to_string(), None)
            };

        UsageState {
            display_limits,
            tray_color,
            menu_bar_text: menu_text,
            accounts,
            active_account_id: self.config.active_account_id.map(|id| id.to_string()),
            auth_status: self.auth_status.clone(),
            error_state: self.error_state.clone(),
            last_updated: self.last_updated.map(|dt| self.last_updated_string(dt)),
            highest_utilization: highest,
            provider_cards,
        }
    }

    fn highest_utilization(&self, data: &UsageData) -> f64 {
        let mut limits = vec![&data.five_hour, &data.seven_day];
        if let Some(ref l) = data.seven_day_sonnet {
            limits.push(l);
        }
        if let Some(ref l) = data.seven_day_opus {
            limits.push(l);
        }
        if let Some(ref l) = data.seven_day_oauth_apps {
            limits.push(l);
        }
        if let Some(ref l) = data.seven_day_cowork {
            limits.push(l);
        }
        if let Some(ref l) = data.iguana_necktie {
            limits.push(l);
        }
        if let Some(ref l) = data.extra_usage {
            limits.push(l);
        }
        limits
            .iter()
            .map(|l| l.utilization)
            .fold(0.0_f64, f64::max)
    }

    fn compute_display_limits(&self, data: &UsageData) -> Vec<DisplayLimit> {
        let mut limits = Vec::new();

        limits.push(self.make_display_limit("Session", &data.five_hour, None));

        let pace = self.weekly_pace_detail(data);
        limits.push(self.make_display_limit("Weekly", &data.seven_day, pace));

        let optional_limits: Vec<(&str, &Option<UsageLimit>)> = vec![
            ("Sonnet", &data.seven_day_sonnet),
            ("Opus", &data.seven_day_opus),
            ("OAuth Apps", &data.seven_day_oauth_apps),
            ("Cowork", &data.seven_day_cowork),
            ("Other", &data.iguana_necktie),
            ("Extra Usage", &data.extra_usage),
        ];

        for (name, opt_limit) in optional_limits {
            if let Some(limit) = opt_limit {
                limits.push(self.make_display_limit(name, limit, None));
            }
        }

        limits
    }

    fn make_display_limit(
        &self,
        name: &str,
        limit: &UsageLimit,
        pace_detail: Option<String>,
    ) -> DisplayLimit {
        let reset_time_display = limit.resets_at.map(|dt| {
            self.format_reset_time(dt)
        });
        let resets_at = limit.resets_at.map(|dt| dt.to_rfc3339());

        DisplayLimit {
            name: name.to_string(),
            utilization: limit.utilization,
            resets_at,
            reset_time_display,
            pace_detail,
        }
    }

    fn format_reset_time(&self, reset_dt: DateTime<Utc>) -> String {
        let local = reset_dt.with_timezone(&Local);
        let now = Local::now();

        let time_str = local.format("%-I:%M %p").to_string();

        if local.date_naive() == now.date_naive() {
            format!("Resets at {}", time_str)
        } else {
            let day = local.format("%a").to_string();
            format!("Resets {} {}", day, time_str)
        }
    }

    fn compute_menu_bar_text(&self, data: &UsageData) -> String {
        let session_pct = data.five_hour.utilization.round() as i64;
        let weekly_pct = data.seven_day.utilization.round() as i64;
        let pace = self.weekly_pace_indicator(data);

        let time_part = self.format_time_display(data);

        format!("{}% · {}% W{} · {}", session_pct, weekly_pct, pace, time_part)
    }

    fn format_time_display(&self, data: &UsageData) -> String {
        match self.config.time_display_format {
            TimeDisplayFormat::ResetTime => self.reset_time_string(data),
            TimeDisplayFormat::RemainingTime => self.remaining_time_string(data),
        }
    }

    fn reset_time_string(&self, data: &UsageData) -> String {
        match data.five_hour.resets_at {
            Some(dt) => {
                let local = dt.with_timezone(&Local);
                local.format("%-I:%M %p").to_string()
            }
            None => "—".to_string(),
        }
    }

    fn remaining_time_string(&self, data: &UsageData) -> String {
        match data.five_hour.resets_at {
            Some(reset_date) => {
                let now = Utc::now();
                let secs = (reset_date - now).num_seconds();
                if secs <= 0 {
                    return "Now".to_string();
                }
                let total_minutes = secs / 60;
                let hours = total_minutes / 60;
                let minutes = total_minutes % 60;
                if hours > 0 {
                    if minutes > 0 {
                        format!("{}h {}m", hours, minutes)
                    } else {
                        format!("{}h", hours)
                    }
                } else {
                    format!("{}m", minutes)
                }
            }
            None => "—".to_string(),
        }
    }

    fn pace_ratio(&self, limit: &UsageLimit, window_seconds: f64) -> Option<f64> {
        let resets_at = limit.resets_at?;
        let now = Utc::now();
        let time_remaining = (resets_at - now).num_seconds() as f64;
        let time_elapsed = window_seconds - time_remaining;

        // Skip pace calculation during the first 6 hours (insufficient data for a stable
        // ratio) and the last hour (remaining time too small, ratio becomes hypersensitive).
        if time_elapsed < 6.0 * 3600.0 || time_remaining < 3600.0 {
            return None;
        }

        let expected = (time_elapsed / window_seconds) * 100.0;
        if expected <= 0.0 {
            return None;
        }
        Some(limit.utilization / expected)
    }

    /// ±15% threshold: tighter triggers too many false pace changes,
    /// wider misses meaningful trends within a 7-day window.
    fn weekly_pace_indicator(&self, data: &UsageData) -> &str {
        match self.pace_ratio(&data.seven_day, SEVEN_DAY_WINDOW_SECS) {
            Some(ratio) if ratio > 1.15 => "▲",
            Some(ratio) if ratio < 0.85 => "▼",
            _ => "",
        }
    }

    fn weekly_pace_detail(&self, data: &UsageData) -> Option<String> {
        let indicator = self.weekly_pace_indicator(data);
        let budget = self.weekly_budget_per_day(data);

        match (indicator.is_empty(), budget) {
            (true, None) => None,
            (true, Some(b)) => Some(b),
            (false, None) => Some(format!("Pace: {}", indicator)),
            (false, Some(b)) => Some(format!("{} · {}", indicator, b)),
        }
    }

    fn weekly_budget_per_day(&self, data: &UsageData) -> Option<String> {
        let seven_day = &data.seven_day;
        let resets_at = seven_day.resets_at?;

        let now = Utc::now();
        let time_remaining = (resets_at - now).num_seconds() as f64;
        let time_elapsed = SEVEN_DAY_WINDOW_SECS - time_remaining;

        // Same stability guard as pace_ratio: need ≥6h elapsed and ≥1h remaining.
        if time_elapsed < 6.0 * 3600.0 {
            return None;
        }
        if time_remaining < 3600.0 {
            return None;
        }

        let remaining = 100.0 - seven_day.utilization;
        if remaining <= 0.0 {
            return Some("Weekly limit reached".to_string());
        }

        let days_remaining = time_remaining / 86400.0;
        let budget_per_day = remaining / days_remaining;
        let days_left = days_remaining as i64;

        Some(format!(
            "~{}%/day remaining ({}d left)",
            budget_per_day.round() as i64,
            days_left
        ))
    }

    fn last_updated_string(&self, dt: DateTime<Utc>) -> String {
        let now = Utc::now();
        let secs = (now - dt).num_seconds();
        if secs < 60 {
            "Just now".to_string()
        } else if secs < 3600 {
            format!("{}m ago", secs / 60)
        } else {
            format!("{}h ago", secs / 3600)
        }
    }
}

/// Tray icon color based on session utilization percentage.
/// - ≥80%: red (near limit)
/// - ≥50%: yellow (moderate usage)
/// - <50%: green (plenty of headroom)
pub fn tray_color_for_utilization(utilization: f64) -> String {
    if utilization >= 80.0 {
        "red".to_string()
    } else if utilization >= 50.0 {
        "yellow".to_string()
    } else {
        "green".to_string()
    }
}

/// Start polling for the active account.
/// Aborts any existing polling task before spawning a new one.
pub async fn start_polling(app: AppHandle, state: Arc<Mutex<AppState>>) {
    // Stop any existing polling BEFORE spawning new task to avoid lock contention
    {
        let mut s = state.lock().await;
        s.stop_polling();
    }

    let state_clone = state.clone();
    let app_clone = app.clone();

    let handle = tauri::async_runtime::spawn(async move {
        // Get account info
        let (account_id, session_key, org_id, http_client) = {
            let s = state_clone.lock().await;
            let id = match s.config.active_account_id {
                Some(id) => id,
                None => return,
            };
            let acct = match s.config.accounts.iter().find(|a| a.id == id) {
                Some(a) => a,
                None => return,
            };
            let org = match &acct.org_id {
                Some(o) => o.clone(),
                None => return,
            };
            let key = match credentials::read_session_key(&id) {
                Some(k) => k,
                None => return,
            };
            let client = s.http_client.clone();
            (id, key, org, client)
        };

        // Initial fetch
        let outcome = perform_fetch(
            &app_clone,
            &state_clone,
            &http_client,
            &session_key,
            &org_id,
            &account_id,
        )
        .await;

        let mut consecutive_errors: u32 = match outcome {
            FetchOutcome::NetworkError => 1,
            _ => 0,
        };

        // Polling loop
        loop {
            let sleep_secs = if consecutive_errors > 0 {
                (POLLING_INTERVAL_SECS * 2u64.pow(consecutive_errors)).min(MAX_BACKOFF_SECS)
            } else {
                POLLING_INTERVAL_SECS
            };
            tokio::time::sleep(tokio::time::Duration::from_secs(sleep_secs)).await;

            // Check if still the active account
            let (current_key, current_org) = {
                let s = state_clone.lock().await;
                if s.config.active_account_id != Some(account_id) {
                    break;
                }
                let acct = match s.config.accounts.iter().find(|a| a.id == account_id) {
                    Some(a) => a,
                    None => break,
                };
                let org = match &acct.org_id {
                    Some(o) => o.clone(),
                    None => break,
                };
                let key = match credentials::read_session_key(&account_id) {
                    Some(k) => k,
                    None => break,
                };
                (key, org)
            };

            let outcome = perform_fetch(
                &app_clone,
                &state_clone,
                &http_client,
                &current_key,
                &current_org,
                &account_id,
            )
            .await;

            match outcome {
                FetchOutcome::NetworkError => {
                    consecutive_errors = consecutive_errors.saturating_add(1);
                }
                _ => {
                    consecutive_errors = 0;
                }
            }
        }
    });

    // Store the new handle — old task already stopped above, no contention
    let mut s = state.lock().await;
    s.polling_handle = Some(handle);
}

async fn perform_fetch(
    app: &AppHandle,
    state: &Arc<Mutex<AppState>>,
    client: &reqwest::Client,
    session_key: &str,
    org_id: &str,
    account_id: &Uuid,
) -> FetchOutcome {
    match api::fetch_usage(client, session_key, org_id).await {
        Ok(result) => {
            let mut s = state.lock().await;

            // Auto-update credential if rotated
            if let Some(ref new_key) = result.new_session_key {
                let _ = credentials::save_session_key(account_id, new_key);
            }

            s.usage_data = Some(result.data);
            s.last_updated = Some(Utc::now());
            s.error_state = None;
            s.auth_status = AuthStatus::Connected;

            // Update tray
            update_tray(app, &s);

            // Emit event
            let usage_state = s.compute_usage_state();
            let _ = app.emit("usage-updated", &usage_state);
            FetchOutcome::Success
        }
        Err(api::ApiError::AuthError { .. }) => {
            let mut s = state.lock().await;
            s.error_state = Some(ErrorState::AuthExpired);
            s.auth_status = AuthStatus::Expired;

            let usage_state = s.compute_usage_state();
            let _ = app.emit("usage-updated", &usage_state);

            // Prompt user to re-authenticate via settings window
            crate::open_settings(app);

            FetchOutcome::AuthError
        }
        Err(_) => {
            let mut s = state.lock().await;
            s.error_state = Some(ErrorState::NetworkError);

            let usage_state = s.compute_usage_state();
            let _ = app.emit("usage-updated", &usage_state);
            FetchOutcome::NetworkError
        }
    }
}

fn update_tray(app: &AppHandle, state: &AppState) {
    if let Some(tray) = app.tray_by_id("main-tray") {
        let usage_state = state.compute_usage_state();

        // Update tooltip
        let _ = tray.set_tooltip(Some(&usage_state.menu_bar_text));

        // Update icon color
        let icon_name = format!("icons/tray-{}.png", usage_state.tray_color);
        if let Ok(icon) = tauri::image::Image::from_path(
            app.path()
                .resource_dir()
                .unwrap_or_default()
                .join(&icon_name),
        ) {
            let _ = tray.set_icon(Some(icon));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::AppConfig;
    use serde_json::Value;

    fn app_state_with_config(config: AppConfig) -> AppState {
        AppState {
            config,
            http_client: reqwest::Client::new(),
            usage_data: None,
            last_updated: None,
            error_state: None,
            auth_status: AuthStatus::Connected,
            polling_handle: None,
        }
    }

    #[test]
    fn usage_state_exposes_active_account_org_id_without_session_key() {
        let account_id = Uuid::new_v4();
        let config = AppConfig {
            accounts: vec![AccountMetadata {
                id: account_id,
                name: "Work".to_string(),
                org_id: Some("org-configured".to_string()),
            }],
            active_account_id: Some(account_id),
            ..AppConfig::default()
        };
        let state = app_state_with_config(config).compute_usage_state();
        let json = serde_json::to_value(&state).expect("usage state serializes");

        assert_eq!(json["accounts"][0]["org_id"], "org-configured");
        assert_no_session_key_fields(&json);
    }

    fn assert_no_session_key_fields(value: &Value) {
        match value {
            Value::Object(map) => {
                assert!(
                    !map.contains_key("session_key"),
                    "frontend state must not serialize session_key"
                );
                assert!(
                    !map.contains_key("sessionKey"),
                    "frontend state must not serialize sessionKey"
                );
                for child in map.values() {
                    assert_no_session_key_fields(child);
                }
            }
            Value::Array(values) => {
                for child in values {
                    assert_no_session_key_fields(child);
                }
            }
            _ => {}
        }
    }
}
