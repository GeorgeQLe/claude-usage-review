import { deriveProviderConfidence, explainProviderConfidence } from "../../../shared/confidence/providerConfidence.js";
import type { ProviderCard } from "../../../shared/types/provider.js";
import { detectGeminiInstall } from "./detector.js";
import type { GeminiInstallDetection } from "./detector.js";
import { parseGeminiSessionTree } from "./sessions.js";
import type { GeminiDerivedEvent, GeminiSessionSummary, ParseGeminiSessionTreeResult } from "./sessions.js";
import { readGeminiStatsSummary, redactGeminiStatsDiagnostics } from "./stats.js";
import type { GeminiStatsCommandRunner, GeminiStatsSummary } from "./stats.js";

export interface GeminiProviderProfile {
  readonly dailyRequestLimit?: number | null;
  readonly label?: string | null;
}

export interface RefreshGeminiProviderSnapshotInput {
  readonly detector?: () => Promise<Partial<GeminiInstallDetection>>;
  readonly sessionReader?: () => Promise<Partial<ParseGeminiSessionTreeResult>>;
  readonly now?: Date;
  readonly profile?: GeminiProviderProfile;
  readonly statsReader?: () => Promise<Partial<GeminiStatsSummary> | null>;
  readonly statsRunner?: GeminiStatsCommandRunner;
  readonly staleAfterMs?: number;
  readonly env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  readonly homeDir?: string;
}

export interface GeminiProviderSnapshot {
  readonly card: ProviderCard;
  readonly dailyHeadroom: number | null;
  readonly events: readonly GeminiDerivedEvent[];
  readonly diagnostics: readonly string[];
}

const defaultStaleAfterMs = 30 * 60 * 1000;

export async function refreshGeminiProviderSnapshot(
  input: RefreshGeminiProviderSnapshotInput = {}
): Promise<GeminiProviderSnapshot> {
  const now = input.now ?? new Date();
  const staleAfterMs = input.staleAfterMs ?? defaultStaleAfterMs;
  const detection = await readDetection(input);
  const sessions = await readSessions(input, detection, now);
  const sessionSummary = normalizeSummary(sessions.summary);
  const stats = normalizeStatsSummary(await readStats(input));
  const summary = mergeSummaries(sessionSummary, stats);
  const events = sanitizeEvents(sessions.events ?? []);
  const diagnostics = sanitizeDiagnostics([
    ...(detection.diagnostics ?? []),
    ...(sessions.diagnostics ?? []),
    ...stats.diagnostics
  ]);
  const hasReliableStatsSummary = stats.confidence === "high_confidence";
  const latestEventAt =
    summary.lastObservedAt ?? latestOccurredAt(events) ?? (hasReliableStatsSummary ? now.toISOString() : null);
  const status = deriveStatus({
    degraded: detection.degraded === true,
    detected: detection.detected === true,
    latestEventAt,
    now,
    staleAfterMs
  });
  const confidence = deriveConfidence(status, summary, hasReliableStatsSummary);
  const dailyHeadroom =
    typeof stats.dailyLimit === "number"
      ? Math.max(0, stats.dailyLimit - summary.dailyRequestCount)
      : typeof input.profile?.dailyRequestLimit === "number"
        ? Math.max(0, input.profile.dailyRequestLimit - summary.dailyRequestCount)
        : null;

  return {
    card: createGeminiCard({
      confidence,
      hasReliableStatsSummary,
      latestEventAt,
      now,
      profileLabel: input.profile?.label ?? null,
      resetAt: stats.resetAt,
      status,
      summary
    }),
    dailyHeadroom,
    events,
    diagnostics
  };
}

async function readDetection(input: RefreshGeminiProviderSnapshotInput): Promise<Partial<GeminiInstallDetection>> {
  if (input.detector) {
    return input.detector();
  }

  return detectGeminiInstall({ env: input.env, homeDir: input.homeDir });
}

async function readSessions(
  input: RefreshGeminiProviderSnapshotInput,
  detection: Partial<GeminiInstallDetection>,
  now: Date
): Promise<Partial<ParseGeminiSessionTreeResult>> {
  if (input.sessionReader) {
    return input.sessionReader();
  }

  if (!detection.installPath) {
    return { summary: emptySummary(), events: [], diagnostics: [], filesScanned: 0 };
  }

  return parseGeminiSessionTree({ rootDir: detection.installPath, now });
}

async function readStats(input: RefreshGeminiProviderSnapshotInput): Promise<Partial<GeminiStatsSummary> | null> {
  if (input.statsReader) {
    return input.statsReader();
  }

  if (input.statsRunner) {
    return readGeminiStatsSummary({ runner: input.statsRunner });
  }

  return null;
}

function mergeSummaries(sessions: GeminiSessionSummary, stats: GeminiStatsSummary): GeminiSessionSummary {
  return {
    dailyRequestCount: stats.dailyRequestCount ?? sessions.dailyRequestCount,
    lastObservedAt: sessions.lastObservedAt,
    model: stats.model ?? sessions.model,
    requestsPerMinute: sessions.requestsPerMinute,
    tokenCount: stats.tokenCount ?? sessions.tokenCount
  };
}

function normalizeStatsSummary(summary: Partial<GeminiStatsSummary> | null | undefined): GeminiStatsSummary {
  return {
    confidence: summary?.confidence === "high_confidence" ? "high_confidence" : "observed_only",
    dailyLimit: readNonNegativeNumber(summary?.dailyLimit),
    dailyRequestCount: readNonNegativeNumber(summary?.dailyRequestCount),
    diagnostics: Array.isArray(summary?.diagnostics) ? summary.diagnostics.filter(isNonEmptyString) : [],
    model: typeof summary?.model === "string" && summary.model.trim() ? summary.model.trim() : null,
    resetAt: readIsoDate(summary?.resetAt),
    tokenCount: readNonNegativeNumber(summary?.tokenCount)
  };
}

function createGeminiCard(input: {
  readonly confidence: ProviderCard["confidence"];
  readonly hasReliableStatsSummary: boolean;
  readonly latestEventAt: string | null;
  readonly now: Date;
  readonly profileLabel: string | null;
  readonly resetAt: string | null;
  readonly status: ProviderCard["status"];
  readonly summary: GeminiSessionSummary;
}): ProviderCard {
  return {
    providerId: "gemini",
    displayName: "Gemini",
    enabled: true,
    status: input.status,
    confidence: input.confidence,
    headline: headlineForStatus(input.status, input.profileLabel),
    detailText: detailForStatus(input.status, input.summary, input.hasReliableStatsSummary),
    sessionUtilization: null,
    weeklyUtilization: null,
    dailyRequestCount: input.summary.dailyRequestCount,
    requestsPerMinute: input.summary.requestsPerMinute,
    resetAt: input.resetAt,
    lastUpdatedAt: input.latestEventAt ?? input.now.toISOString(),
    adapterMode: input.hasReliableStatsSummary ? "accuracy" : "passive",
    confidenceExplanation: explainProviderConfidence({
      providerId: "gemini",
      confidence: input.confidence,
      source: input.hasReliableStatsSummary ? "stats-summary" : "local-sessions"
    }),
    actions: ["refresh", "diagnostics"]
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function deriveStatus(input: {
  readonly degraded: boolean;
  readonly detected: boolean;
  readonly latestEventAt: string | null;
  readonly now: Date;
  readonly staleAfterMs: number;
}): ProviderCard["status"] {
  if (!input.detected) {
    return "missing_configuration";
  }

  if (input.degraded) {
    return "degraded";
  }

  if (!input.latestEventAt) {
    return "degraded";
  }

  const latestMs = Date.parse(input.latestEventAt);
  if (!Number.isFinite(latestMs)) {
    return "degraded";
  }

  return input.now.getTime() - latestMs > input.staleAfterMs ? "stale" : "configured";
}

function deriveConfidence(
  status: ProviderCard["status"],
  summary: GeminiSessionSummary,
  hasReliableStatsSummary: boolean
): ProviderCard["confidence"] {
  if (status === "degraded" || status === "missing_configuration") {
    return "observed_only";
  }

  if (hasReliableStatsSummary) {
    return "high_confidence";
  }

  if (summary.dailyRequestCount === 0 && summary.tokenCount === 0) {
    return "observed_only";
  }

  return deriveProviderConfidence({
    providerId: "gemini",
    requestedConfidence: "estimated",
    sources: ["local-sessions"]
  }).confidence;
}

function headlineForStatus(status: ProviderCard["status"], profileLabel: string | null): string {
  if (status === "missing_configuration") {
    return "Gemini not detected";
  }

  if (status === "stale") {
    return "Gemini activity is stale";
  }

  if (status === "degraded") {
    return "Gemini activity unavailable";
  }

  return profileLabel ? `Gemini ready for ${profileLabel}` : "Gemini ready";
}

function detailForStatus(
  status: ProviderCard["status"],
  summary: GeminiSessionSummary,
  hasReliableStatsSummary: boolean
): string {
  if (status === "missing_configuration") {
    return "Gemini local configuration was not found.";
  }

  if (status === "stale") {
    return "Gemini passive activity is stale; refresh or use Gemini to update the estimate.";
  }

  if (status === "degraded") {
    return "Gemini is detected, but no recent passive activity could be parsed.";
  }

  const modelText = summary.model ? ` Latest model: ${summary.model}.` : "";
  return `${hasReliableStatsSummary ? "High confidence from Gemini /stats." : "Estimated from local Gemini activity."}${modelText}`;
}

function normalizeSummary(summary: Partial<GeminiSessionSummary> | undefined): GeminiSessionSummary {
  return {
    dailyRequestCount: readNonNegativeNumber(summary?.dailyRequestCount) ?? 0,
    lastObservedAt: readIsoDate(summary?.lastObservedAt),
    model: typeof summary?.model === "string" && summary.model.trim() ? summary.model.trim() : null,
    requestsPerMinute: readNonNegativeNumber(summary?.requestsPerMinute) ?? 0,
    tokenCount: readNonNegativeNumber(summary?.tokenCount) ?? 0
  };
}

function emptySummary(): GeminiSessionSummary {
  return {
    dailyRequestCount: 0,
    lastObservedAt: null,
    model: null,
    requestsPerMinute: 0,
    tokenCount: 0
  };
}

function latestOccurredAt(events: readonly GeminiDerivedEvent[]): string | null {
  const latestMs = events.reduce<number | null>((latest, event) => {
    const next = Date.parse(event.occurredAt);
    if (!Number.isFinite(next)) {
      return latest;
    }

    return latest === null || next > latest ? next : latest;
  }, null);

  return latestMs === null ? null : new Date(latestMs).toISOString();
}

function sanitizeEvents(events: readonly GeminiDerivedEvent[]): readonly GeminiDerivedEvent[] {
  return events.map((event) => ({
    occurredAt: event.occurredAt,
    source: event.source,
    ...(event.model ? { model: event.model } : {}),
    ...(typeof event.tokenCount === "number" ? { tokenCount: event.tokenCount } : {})
  }));
}

function sanitizeDiagnostics(messages: readonly string[]): readonly string[] {
  return messages.map((message) =>
    redactGeminiStatsDiagnostics(
      message.replace(
        /(prompt|response|chat body|oauth[_-]?creds)(?:\s*[=:]\s*\S+)?/giu,
        "redacted"
      )
    )
  );
}

function readNonNegativeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function readIsoDate(value: unknown): string | null {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    return null;
  }

  return new Date(value).toISOString();
}
