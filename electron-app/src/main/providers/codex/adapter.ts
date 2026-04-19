import path from "node:path";
import { deriveProviderConfidence, explainProviderConfidence } from "../../../shared/confidence/providerConfidence.js";
import type { ProviderCard } from "../../../shared/types/provider.js";
import { detectCodexInstall } from "./detector.js";
import type { CodexInstallDetection } from "./detector.js";
import { parseCodexHistory } from "./history.js";
import type { CodexDerivedEvent, ParseCodexHistoryResult } from "./history.js";
import { parseCodexSessionTree } from "./sessions.js";
import type { ParseCodexSessionTreeResult } from "./sessions.js";

export interface CodexProviderBookmarks {
  readonly historyByteOffset: number;
}

export interface RefreshCodexProviderSnapshotInput {
  readonly detector?: () => Promise<Partial<CodexInstallDetection> & { readonly accountLabel?: string | null }>;
  readonly historyReader?: () => Promise<Partial<ParseCodexHistoryResult>>;
  readonly sessionReader?: () => Promise<Partial<ParseCodexSessionTreeResult>>;
  readonly wrapperEventReader?: () => Promise<Partial<CodexWrapperEventReadResult>>;
  readonly now?: Date;
  readonly staleAfterMs?: number;
  readonly bookmarks?: Partial<CodexProviderBookmarks>;
  readonly env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  readonly homeDir?: string;
}

export interface CodexProviderSnapshot {
  readonly card: ProviderCard;
  readonly bookmarks: CodexProviderBookmarks;
  readonly events: readonly CodexDerivedEvent[];
  readonly diagnostics: readonly string[];
}

export interface CodexWrapperEventReadResult {
  readonly events: readonly CodexWrapperEvent[];
  readonly verified: boolean;
  readonly diagnostics?: readonly string[];
}

export interface CodexWrapperEvent {
  readonly commandMode?: string | null;
  readonly durationMs?: number | null;
  readonly exitStatus?: number | null;
  readonly invocationId?: string;
  readonly limitHit?: boolean;
  readonly model?: string | null;
  readonly providerId: string;
  readonly startedAt: string;
  readonly wrapperVersion?: string | null;
}

interface CodexWrapperSummary {
  readonly diagnostics: readonly string[];
  readonly invocationCount: number;
  readonly latestStartedAt: string | null;
  readonly limitHitCount: number;
  readonly verified: boolean;
}

const defaultStaleAfterMs = 30 * 60 * 1000;

export async function refreshCodexProviderSnapshot(
  input: RefreshCodexProviderSnapshotInput = {}
): Promise<CodexProviderSnapshot> {
  const now = input.now ?? new Date();
  const staleAfterMs = input.staleAfterMs ?? defaultStaleAfterMs;
  const detection = await readDetection(input);
  const history = await readHistory(input, detection);
  const sessions = await readSessions(input, detection);
  const wrapperEvents = await readWrapperEvents(input);
  const wrapperSummary = summarizeWrapperEvents(wrapperEvents, now);
  const events = sanitizeEvents([...(history.events ?? []), ...(sessions.events ?? [])]);
  const latestEventAt = latestOccurredAtFromCandidates([latestOccurredAt(events), wrapperSummary.latestStartedAt]);
  const status = deriveStatus({
    detected: detection.detected === true,
    latestEventAt,
    now,
    staleAfterMs
  });
  const accountLabel = detection.auth?.accountLabel ?? detection.accountLabel ?? null;
  const diagnostics = sanitizeDiagnostics([
    ...(detection.diagnostics ?? []),
    ...(history.diagnostics ?? []),
    ...(sessions.diagnostics ?? []),
    ...wrapperSummary.diagnostics
  ]);

  return {
    card: createCodexCard({
      accountLabel,
      dailyRequestCount: events.length + wrapperSummary.invocationCount === 0 ? null : events.length + wrapperSummary.invocationCount,
      latestEventAt,
      now,
      status,
      wrapperSummary
    }),
    bookmarks: {
      historyByteOffset: history.bookmark?.byteOffset ?? input.bookmarks?.historyByteOffset ?? 0
    },
    events,
    diagnostics
  };
}

async function readWrapperEvents(input: RefreshCodexProviderSnapshotInput): Promise<CodexWrapperEventReadResult> {
  if (!input.wrapperEventReader) {
    return { events: [], verified: false, diagnostics: [] };
  }

  const result = await input.wrapperEventReader();
  return {
    events: Array.isArray(result.events) ? result.events : [],
    verified: result.verified === true,
    diagnostics: Array.isArray(result.diagnostics) ? result.diagnostics.filter(isNonEmptyString) : []
  };
}

async function readDetection(input: RefreshCodexProviderSnapshotInput): Promise<Partial<CodexInstallDetection> & {
  readonly accountLabel?: string | null;
}> {
  if (input.detector) {
    return input.detector();
  }

  return detectCodexInstall({ env: input.env, homeDir: input.homeDir });
}

async function readHistory(
  input: RefreshCodexProviderSnapshotInput,
  detection: Partial<CodexInstallDetection>
): Promise<Partial<ParseCodexHistoryResult>> {
  if (input.historyReader) {
    return input.historyReader();
  }

  if (!detection.installPath) {
    return { bookmark: { byteOffset: input.bookmarks?.historyByteOffset ?? 0 }, events: [], diagnostics: [] };
  }

  return parseCodexHistory({
    historyPath: path.join(detection.installPath, "history.jsonl"),
    bookmark: { byteOffset: input.bookmarks?.historyByteOffset ?? 0 }
  });
}

async function readSessions(
  input: RefreshCodexProviderSnapshotInput,
  detection: Partial<CodexInstallDetection>
): Promise<Partial<ParseCodexSessionTreeResult>> {
  if (input.sessionReader) {
    return input.sessionReader();
  }

  if (!detection.installPath) {
    return { events: [], diagnostics: [], filesScanned: 0 };
  }

  return parseCodexSessionTree({ rootDir: detection.installPath });
}

function createCodexCard(input: {
  readonly accountLabel: string | null;
  readonly dailyRequestCount: number | null;
  readonly latestEventAt: string | null;
  readonly now: Date;
  readonly status: ProviderCard["status"];
  readonly wrapperSummary: CodexWrapperSummary;
}): ProviderCard {
  const hasVerifiedWrapperEvents = input.wrapperSummary.verified && input.wrapperSummary.invocationCount > 0;
  const confidence = deriveProviderConfidence({
    providerId: "codex",
    requestedConfidence: hasVerifiedWrapperEvents ? "exact" : "estimated",
    sources: hasVerifiedWrapperEvents
      ? ["local-history", "local-sessions", "verified-wrapper-events", "stderr-limit-signals"]
      : ["local-history", "local-sessions"]
  }).confidence;

  return {
    providerId: "codex",
    displayName: "Codex",
    enabled: true,
    status: input.status,
    confidence,
    headline: headlineForStatus(input.status, input.accountLabel),
    detailText: detailForStatus(input.status),
    sessionUtilization: null,
    weeklyUtilization: null,
    dailyRequestCount: input.dailyRequestCount,
    requestsPerMinute: null,
    resetAt: null,
    lastUpdatedAt: input.latestEventAt ?? input.now.toISOString(),
    adapterMode: hasVerifiedWrapperEvents ? "accuracy" : "passive",
    confidenceExplanation: explainProviderConfidence({
      providerId: "codex",
      confidence,
      source: hasVerifiedWrapperEvents ? "verified-wrapper-events" : "local-history"
    }),
    actions: ["refresh", "diagnostics"]
  };
}

function deriveStatus(input: {
  readonly detected: boolean;
  readonly latestEventAt: string | null;
  readonly now: Date;
  readonly staleAfterMs: number;
}): ProviderCard["status"] {
  if (!input.detected) {
    return "missing_configuration";
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

function headlineForStatus(status: ProviderCard["status"], accountLabel: string | null): string {
  if (status === "missing_configuration") {
    return "Codex not detected";
  }

  if (status === "stale") {
    return "Codex activity is stale";
  }

  if (status === "degraded") {
    return "Codex activity unavailable";
  }

  return accountLabel ? `Codex ready for ${accountLabel}` : "Codex ready";
}

function detailForStatus(status: ProviderCard["status"]): string {
  if (status === "missing_configuration") {
    return "Codex local configuration was not found.";
  }

  if (status === "stale") {
    return "Codex passive activity is stale; refresh or use Codex to update the estimate.";
  }

  if (status === "degraded") {
    return "Codex is detected, but no recent passive activity could be parsed.";
  }

  return "Estimated from local Codex activity.";
}

function summarizeWrapperEvents(wrapperEvents: CodexWrapperEventReadResult, now: Date): CodexWrapperSummary {
  if (!wrapperEvents.verified) {
    return {
      diagnostics: sanitizeDiagnostics(wrapperEvents.diagnostics ?? []),
      invocationCount: 0,
      latestStartedAt: null,
      limitHitCount: 0,
      verified: false
    };
  }

  const events = wrapperEvents.events.filter((event) => event.providerId === "codex");
  const latestStartedAt = latestStartedAtFromWrapperEvents(events);

  return {
    diagnostics: sanitizeDiagnostics(wrapperEvents.diagnostics ?? []),
    invocationCount: countWrapperEventsToday(events, now),
    latestStartedAt,
    limitHitCount: events.filter((event) => event.limitHit === true).length,
    verified: true
  };
}

function latestStartedAtFromWrapperEvents(events: readonly CodexWrapperEvent[]): string | null {
  const latestMs = events.reduce<number | null>((latest, event) => {
    const next = Date.parse(event.startedAt);
    if (!Number.isFinite(next)) {
      return latest;
    }

    return latest === null || next > latest ? next : latest;
  }, null);

  return latestMs === null ? null : new Date(latestMs).toISOString();
}

function countWrapperEventsToday(events: readonly CodexWrapperEvent[], now: Date): number {
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const nowMs = now.getTime();

  return events.filter((event) => {
    const startedMs = Date.parse(event.startedAt);
    return Number.isFinite(startedMs) && startedMs >= dayStart && startedMs <= nowMs;
  }).length;
}

function latestOccurredAt(events: readonly CodexDerivedEvent[]): string | null {
  const latestMs = events.reduce<number | null>((latest, event) => {
    const next = Date.parse(event.occurredAt);
    if (!Number.isFinite(next)) {
      return latest;
    }

    return latest === null || next > latest ? next : latest;
  }, null);

  return latestMs === null ? null : new Date(latestMs).toISOString();
}

function latestOccurredAtFromCandidates(candidates: readonly (string | null)[]): string | null {
  const latestMs = candidates.reduce<number | null>((latest, value) => {
    if (!value) {
      return latest;
    }

    const next = Date.parse(value);
    if (!Number.isFinite(next)) {
      return latest;
    }

    return latest === null || next > latest ? next : latest;
  }, null);

  return latestMs === null ? null : new Date(latestMs).toISOString();
}

function sanitizeEvents(events: readonly CodexDerivedEvent[]): readonly CodexDerivedEvent[] {
  return events.map((event) => ({
    occurredAt: event.occurredAt,
    source: event.source,
    ...(event.model ? { model: event.model } : {}),
    ...(typeof event.tokenCount === "number" ? { tokenCount: event.tokenCount } : {}),
    ...(event.limitHit ? { limitHit: true } : {}),
    ...(event.cooldownUntil ? { cooldownUntil: event.cooldownUntil } : {})
  }));
}

function sanitizeDiagnostics(messages: readonly string[]): readonly string[] {
  return messages.map((message) =>
    message.replace(/(access[_-]?token|api[_-]?key|authorization|bearer|cookie|session[_-]?key|prompt|response)/giu, "redacted")
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
