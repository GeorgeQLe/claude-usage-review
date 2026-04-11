use serde::{Deserialize, Serialize};

use crate::models::{AuthStatus, UsageData};

// MARK: - ProviderId

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProviderId {
    Claude,
    Codex,
    Gemini,
}

// MARK: - CardState

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CardState {
    Configured,
    MissingConfiguration,
    Degraded,
    Stale,
}

// MARK: - ConfidenceLevel

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConfidenceLevel {
    Exact,
    HighConfidence,
    Estimated,
    ObservedOnly,
}

impl ConfidenceLevel {
    pub fn explanation(&self) -> &'static str {
        match self {
            Self::Exact => "Exact usage from API",
            Self::HighConfidence => "High confidence from limit detection and plan profile",
            Self::Estimated => "Estimated from wrapper events and plan profile",
            Self::ObservedOnly => "Observed activity only — configure a plan for better accuracy",
        }
    }
}

// MARK: - Estimate types

#[derive(Debug, Clone)]
pub struct CodexEstimate {
    pub confidence: ConfidenceLevel,
}

#[derive(Debug, Clone)]
pub struct GeminiEstimate {
    pub confidence: ConfidenceLevel,
}

// MARK: - ProviderSnapshot

#[derive(Debug, Clone)]
pub enum ProviderSnapshot {
    ClaudeRich {
        usage: UsageData,
        auth_status: AuthStatus,
        is_enabled: bool,
    },
    ClaudeSimple {
        is_enabled: bool,
    },
    Codex {
        is_enabled: bool,
    },
    CodexRich {
        estimate: CodexEstimate,
        is_enabled: bool,
    },
    Gemini {
        is_enabled: bool,
    },
    GeminiRich {
        estimate: GeminiEstimate,
        is_enabled: bool,
    },
}

impl ProviderSnapshot {
    pub fn id(&self) -> ProviderId {
        match self {
            Self::ClaudeRich { .. } | Self::ClaudeSimple { .. } => ProviderId::Claude,
            Self::Codex { .. } | Self::CodexRich { .. } => ProviderId::Codex,
            Self::Gemini { .. } | Self::GeminiRich { .. } => ProviderId::Gemini,
        }
    }
}

// MARK: - ProviderCard

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderCard {
    pub id: ProviderId,
    pub card_state: CardState,
    pub headline: String,
    pub detail_text: Option<String>,
    pub session_utilization: Option<f64>,
    pub weekly_utilization: Option<f64>,
    pub confidence_explanation: Option<String>,
}

// MARK: - ShellState

#[derive(Debug, Clone)]
pub struct ShellState {
    pub providers: Vec<ProviderCard>,
}

impl ShellState {
    pub fn tray_provider(&self) -> Option<&ProviderCard> {
        self.providers.iter().find(|p| p.card_state == CardState::Configured)
    }
}

// MARK: - Tests

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{UsageData, UsageLimit};

    // Helper: build a minimal UsageData for tests
    fn stub_usage_data(utilization: f64) -> UsageData {
        let limit = UsageLimit {
            utilization,
            resets_at: None,
        };
        UsageData {
            five_hour: limit.clone(),
            seven_day: limit,
            seven_day_sonnet: None,
            seven_day_opus: None,
            seven_day_oauth_apps: None,
            seven_day_cowork: None,
            iguana_necktie: None,
            extra_usage: None,
        }
    }

    fn stub_card(id: ProviderId, state: CardState) -> ProviderCard {
        ProviderCard {
            id,
            card_state: state,
            headline: String::new(),
            detail_text: None,
            session_utilization: None,
            weekly_utilization: None,
            confidence_explanation: None,
        }
    }

    // ── ProviderModelTests ──────────────────────────────────────────

    #[test]
    fn test_provider_id_variants() {
        let ids = [ProviderId::Claude, ProviderId::Codex, ProviderId::Gemini];
        assert_eq!(ids.len(), 3);
        assert_ne!(ids[0], ids[1]);
        assert_ne!(ids[1], ids[2]);
    }

    #[test]
    fn test_provider_snapshot_claude_rich() {
        let snap = ProviderSnapshot::ClaudeRich {
            usage: stub_usage_data(0.42),
            auth_status: AuthStatus::Connected,
            is_enabled: true,
        };
        assert_eq!(snap.id(), ProviderId::Claude);
    }

    #[test]
    fn test_provider_snapshot_codex_rich() {
        let snap = ProviderSnapshot::CodexRich {
            estimate: CodexEstimate {
                confidence: ConfidenceLevel::HighConfidence,
            },
            is_enabled: true,
        };
        assert_eq!(snap.id(), ProviderId::Codex);
    }

    #[test]
    fn test_provider_snapshot_gemini_rich() {
        let snap = ProviderSnapshot::GeminiRich {
            estimate: GeminiEstimate {
                confidence: ConfidenceLevel::Estimated,
            },
            is_enabled: true,
        };
        assert_eq!(snap.id(), ProviderId::Gemini);
    }

    #[test]
    fn test_provider_snapshot_id_extraction() {
        let cases: Vec<(ProviderSnapshot, ProviderId)> = vec![
            (
                ProviderSnapshot::ClaudeRich {
                    usage: stub_usage_data(0.1),
                    auth_status: AuthStatus::Connected,
                    is_enabled: true,
                },
                ProviderId::Claude,
            ),
            (
                ProviderSnapshot::ClaudeSimple { is_enabled: false },
                ProviderId::Claude,
            ),
            (
                ProviderSnapshot::Codex { is_enabled: true },
                ProviderId::Codex,
            ),
            (
                ProviderSnapshot::CodexRich {
                    estimate: CodexEstimate {
                        confidence: ConfidenceLevel::Exact,
                    },
                    is_enabled: true,
                },
                ProviderId::Codex,
            ),
            (
                ProviderSnapshot::Gemini { is_enabled: true },
                ProviderId::Gemini,
            ),
            (
                ProviderSnapshot::GeminiRich {
                    estimate: GeminiEstimate {
                        confidence: ConfidenceLevel::ObservedOnly,
                    },
                    is_enabled: true,
                },
                ProviderId::Gemini,
            ),
        ];
        for (snap, expected) in cases {
            assert_eq!(snap.id(), expected);
        }
    }

    // ── CardStateTests ──────────────────────────────────────────────

    #[test]
    fn test_card_state_configured() {
        let json = serde_json::to_string(&CardState::Configured).unwrap();
        assert_eq!(json, "\"configured\"");
    }

    #[test]
    fn test_card_state_stale() {
        let json = serde_json::to_string(&CardState::Stale).unwrap();
        assert_eq!(json, "\"stale\"");
    }

    #[test]
    fn test_card_state_degraded() {
        let json = serde_json::to_string(&CardState::Degraded).unwrap();
        assert_eq!(json, "\"degraded\"");
    }

    #[test]
    fn test_provider_card_serialization() {
        let card = ProviderCard {
            id: ProviderId::Claude,
            card_state: CardState::Configured,
            headline: "Claude 42% session".into(),
            detail_text: None,
            session_utilization: Some(0.42),
            weekly_utilization: Some(0.15),
            confidence_explanation: None,
        };
        let json = serde_json::to_string(&card).unwrap();
        let round_tripped: ProviderCard = serde_json::from_str(&json).unwrap();
        assert_eq!(round_tripped.id, ProviderId::Claude);
        assert_eq!(round_tripped.card_state, CardState::Configured);
        assert_eq!(round_tripped.headline, "Claude 42% session");
        assert_eq!(round_tripped.session_utilization, Some(0.42));
    }

    // ── ConfidenceTests ─────────────────────────────────────────────

    #[test]
    fn test_confidence_label_variants() {
        let variants = [
            ConfidenceLevel::Exact,
            ConfidenceLevel::HighConfidence,
            ConfidenceLevel::Estimated,
            ConfidenceLevel::ObservedOnly,
        ];
        assert_eq!(variants.len(), 4);
        // All distinct
        for i in 0..variants.len() {
            for j in (i + 1)..variants.len() {
                assert_ne!(variants[i], variants[j]);
            }
        }
    }

    #[test]
    fn test_confidence_explanation_observed_only() {
        let explanation = ConfidenceLevel::ObservedOnly.explanation();
        assert!(
            explanation.to_lowercase().contains("plan"),
            "ObservedOnly explanation should mention 'plan', got: {explanation}"
        );
    }

    #[test]
    fn test_confidence_explanation_high_confidence() {
        let explanation = ConfidenceLevel::HighConfidence.explanation();
        assert!(
            explanation.to_lowercase().contains("limit"),
            "HighConfidence explanation should mention 'limit', got: {explanation}"
        );
    }

    // ── ShellStateTests ─────────────────────────────────────────────

    #[test]
    fn test_shell_state_tray_provider_prefers_configured() {
        let state = ShellState {
            providers: vec![
                stub_card(ProviderId::Claude, CardState::MissingConfiguration),
                stub_card(ProviderId::Codex, CardState::Configured),
                stub_card(ProviderId::Gemini, CardState::Configured),
            ],
        };
        let tray = state.tray_provider().expect("should find a configured provider");
        assert_eq!(tray.id, ProviderId::Codex);
    }

    #[test]
    fn test_shell_state_skips_degraded() {
        let state = ShellState {
            providers: vec![
                stub_card(ProviderId::Claude, CardState::Degraded),
                stub_card(ProviderId::Codex, CardState::Configured),
            ],
        };
        let tray = state.tray_provider().expect("should find a configured provider");
        assert_eq!(tray.id, ProviderId::Codex);
    }

    #[test]
    fn test_shell_state_empty_providers() {
        let state = ShellState {
            providers: vec![],
        };
        assert!(state.tray_provider().is_none());
    }
}
