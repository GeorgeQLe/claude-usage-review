import type { ProviderConfidence, ProviderId } from "../types/provider.js";

export interface ProviderConfidenceExplanationInput {
  readonly providerId: ProviderId;
  readonly confidence: ProviderConfidence;
  readonly source: string;
}

export interface ProviderConfidenceDerivationInput {
  readonly providerId: ProviderId;
  readonly sources: readonly string[];
  readonly requestedConfidence: ProviderConfidence;
}

export interface ProviderConfidenceDerivation {
  readonly confidence: ProviderConfidence;
  readonly downgraded: boolean;
  readonly reason: string | null;
}

const passiveProviderIds = new Set<ProviderId>(["codex", "gemini"]);

export function explainProviderConfidence(input: ProviderConfidenceExplanationInput): string {
  if (input.providerId === "claude" && input.confidence === "exact") {
    return "Exact from the Claude API for the active account.";
  }

  if (input.providerId === "codex") {
    if (input.source === "verified-wrapper-events") {
      return "High confidence from Codex Accuracy Mode wrapper events.";
    }

    if (input.source === "local-history") {
      return "Estimated from local Codex activity.";
    }

    return "Estimated from passive Codex signals.";
  }

  if (input.providerId === "gemini") {
    if (input.source === "verified-wrapper-events") {
      return "High confidence from Gemini Accuracy Mode wrapper events.";
    }

    if (input.source === "stats-summary") {
      return "High confidence from Gemini /stats.";
    }

    return "Estimated from local Gemini activity.";
  }

  if (input.confidence === "high_confidence") {
    return "High confidence from provider activity.";
  }

  if (input.confidence === "estimated") {
    return "Estimated from local provider activity.";
  }

  return "Observed from local provider activity.";
}

export function deriveProviderConfidence(input: ProviderConfidenceDerivationInput): ProviderConfidenceDerivation {
  if (input.requestedConfidence === "exact" && passiveProviderIds.has(input.providerId) && !hasExactSource(input.sources)) {
    if (hasVerifiedWrapperSource(input.sources)) {
      return {
        confidence: "high_confidence",
        downgraded: true,
        reason: `${formatProviderName(input.providerId)} Accuracy Mode wrapper events improve confidence but cannot prove exact remaining quota.`
      };
    }

    return {
      confidence: "estimated",
      downgraded: true,
      reason: `${formatProviderName(input.providerId)} passive sources cannot claim exact remaining quota.`
    };
  }

  return {
    confidence: input.requestedConfidence,
    downgraded: false,
    reason: null
  };
}

function hasExactSource(sources: readonly string[]): boolean {
  return sources.some((source) => source === "provider-api" || source === "exact-provider-api");
}

function hasVerifiedWrapperSource(sources: readonly string[]): boolean {
  return sources.some((source) => source === "verified-wrapper-events");
}

function formatProviderName(providerId: ProviderId): string {
  if (providerId === "codex") {
    return "Codex";
  }

  if (providerId === "gemini") {
    return "Gemini";
  }

  if (providerId === "claude") {
    return "Claude";
  }

  return "Provider";
}
