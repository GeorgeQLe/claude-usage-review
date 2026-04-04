use crate::models::{AccountMetadata, OverlayLayout, OverlayPosition, TimeDisplayFormat};
use log::warn;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    #[serde(default)]
    pub accounts: Vec<AccountMetadata>,
    pub active_account_id: Option<Uuid>,
    #[serde(default)]
    pub time_display_format: TimeDisplayFormat,
    #[serde(default)]
    pub overlay_enabled: bool,
    #[serde(default)]
    pub overlay_layout: OverlayLayout,
    #[serde(default = "default_opacity")]
    pub overlay_opacity: f64,
    pub overlay_position: Option<OverlayPosition>,
}

fn default_opacity() -> f64 {
    0.85
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            accounts: Vec::new(),
            active_account_id: None,
            time_display_format: TimeDisplayFormat::default(),
            overlay_enabled: false,
            overlay_layout: OverlayLayout::default(),
            overlay_opacity: default_opacity(),
            overlay_position: None,
        }
    }
}

pub fn config_path() -> PathBuf {
    let base = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join("ClaudeUsage").join("config.json")
}

pub fn load_config() -> AppConfig {
    let path = config_path();
    if path.exists() {
        match fs::read_to_string(&path) {
            Ok(content) => match serde_json::from_str(&content) {
                Ok(config) => config,
                Err(e) => {
                    warn!("Config file corrupted, using defaults: {}", e);
                    AppConfig::default()
                }
            },
            Err(e) => {
                warn!("Failed to read config file: {}", e);
                AppConfig::default()
            }
        }
    } else {
        AppConfig::default()
    }
}

pub fn save_config(config: &AppConfig) -> Result<(), String> {
    let path = config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }
    let json = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    fs::write(&path, json).map_err(|e| format!("Failed to write config: {}", e))
}
