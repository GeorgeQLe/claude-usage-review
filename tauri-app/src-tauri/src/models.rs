use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::provider_types::ProviderCard;

/// Raw API response limit
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct UsageLimit {
    pub utilization: f64,
    #[serde(default, deserialize_with = "deserialize_optional_datetime")]
    pub resets_at: Option<DateTime<Utc>>,
}

/// Full API response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageData {
    pub five_hour: UsageLimit,
    pub seven_day: UsageLimit,
    pub seven_day_sonnet: Option<UsageLimit>,
    pub seven_day_opus: Option<UsageLimit>,
    pub seven_day_oauth_apps: Option<UsageLimit>,
    pub seven_day_cowork: Option<UsageLimit>,
    pub iguana_necktie: Option<UsageLimit>,
    pub extra_usage: Option<UsageLimit>,
}

/// Stored account metadata (persisted to config.json)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountMetadata {
    pub id: Uuid,
    #[serde(alias = "email")]
    pub name: String,
    pub org_id: Option<String>,
}

/// Account info sent to frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountInfo {
    pub id: String,
    pub name: String,
    pub is_configured: bool,
    pub is_active: bool,
}

/// Pre-computed display limit for frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DisplayLimit {
    pub name: String,
    pub utilization: f64,
    pub resets_at: Option<String>,
    pub reset_time_display: Option<String>,
    pub pace_detail: Option<String>,
}

/// Auth status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum AuthStatus {
    #[serde(rename = "connected")]
    Connected,
    #[serde(rename = "expired")]
    Expired,
    #[serde(rename = "not_configured")]
    NotConfigured,
}

/// Error state for frontend display
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ErrorState {
    #[serde(rename = "auth_expired")]
    AuthExpired,
    #[serde(rename = "network_error")]
    NetworkError,
}

/// Full view model sent to frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageState {
    pub display_limits: Vec<DisplayLimit>,
    pub tray_color: String,
    pub menu_bar_text: String,
    pub accounts: Vec<AccountInfo>,
    pub active_account_id: Option<String>,
    pub auth_status: AuthStatus,
    pub error_state: Option<ErrorState>,
    pub last_updated: Option<String>,
    pub highest_utilization: f64,
    pub provider_cards: Option<Vec<ProviderCard>>,
}

/// Overlay layout options
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum OverlayLayout {
    #[serde(rename = "compact")]
    Compact,
    #[serde(rename = "minimal")]
    Minimal,
    #[serde(rename = "sidebar")]
    Sidebar,
}

impl Default for OverlayLayout {
    fn default() -> Self {
        Self::Compact
    }
}

/// Time display format preference
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TimeDisplayFormat {
    #[serde(rename = "reset_time")]
    ResetTime,
    #[serde(rename = "remaining_time")]
    RemainingTime,
}

impl Default for TimeDisplayFormat {
    fn default() -> Self {
        Self::ResetTime
    }
}

/// Overlay position
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OverlayPosition {
    pub x: f64,
    pub y: f64,
}

/// Custom datetime deserialization handling ISO8601 with optional fractional seconds
fn deserialize_optional_datetime<'de, D>(
    deserializer: D,
) -> Result<Option<DateTime<Utc>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let opt: Option<String> = Option::deserialize(deserializer)?;
    match opt {
        None => Ok(None),
        Some(s) => {
            // Try with fractional seconds first
            if let Ok(dt) = DateTime::parse_from_rfc3339(&s) {
                return Ok(Some(dt.with_timezone(&Utc)));
            }
            // Try basic ISO8601
            if let Ok(dt) = DateTime::parse_from_str(&s, "%Y-%m-%dT%H:%M:%S%z") {
                return Ok(Some(dt.with_timezone(&Utc)));
            }
            // Try with Z suffix
            if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(&s, "%Y-%m-%dT%H:%M:%S") {
                return Ok(Some(dt.and_utc()));
            }
            if let Ok(dt) =
                chrono::NaiveDateTime::parse_from_str(&s, "%Y-%m-%dT%H:%M:%S%.f")
            {
                return Ok(Some(dt.and_utc()));
            }
            Err(serde::de::Error::custom(format!(
                "Failed to parse datetime: {}",
                s
            )))
        }
    }
}
