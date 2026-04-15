export type ProviderId = "claude" | "codex" | "gemini" | (string & {});

export type ProviderStatus =
  | "configured"
  | "missing_configuration"
  | "stale"
  | "degraded"
  | "expired";

export type ProviderConfidence = "exact" | "high_confidence" | "estimated" | "observed_only";

export type ProviderAdapterMode = "passive" | "accuracy";

export interface ProviderCard {
  readonly providerId: ProviderId;
  readonly displayName: string;
  readonly enabled: boolean;
  readonly status: ProviderStatus;
  readonly confidence: ProviderConfidence;
  readonly headline: string;
  readonly detailText: string | null;
  readonly sessionUtilization: number | null;
  readonly weeklyUtilization: number | null;
  readonly dailyRequestCount: number | null;
  readonly requestsPerMinute: number | null;
  readonly resetAt: string | null;
  readonly lastUpdatedAt: string | null;
  readonly adapterMode: ProviderAdapterMode;
  readonly confidenceExplanation: string;
  readonly actions: readonly string[];
}
