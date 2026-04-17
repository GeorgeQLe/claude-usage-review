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

const defaultStaleAfterMs = 30 * 60 * 1000;

export async function refreshCodexProviderSnapshot(
  input: RefreshCodexProviderSnapshotInput = {}
): Promise<CodexProviderSnapshot> {
  const now = input.now ?? new Date();
  const staleAfterMs = input.staleAfterMs ?? defaultStaleAfterMs;
  const detection = await readDetection(input);
  const history = await readHistory(input, detection);
  const sessions = await readSessions(input, detection);
  const events = sanitizeEvents([...(history.events ?? []), ...(sessions.events ?? [])]);
  const latestEventAt = latestOccurredAt(events);
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
    ...(sessions.diagnostics ?? [])
  ]);

  return {
    card: createCodexCard({
      accountLabel,
      dailyRequestCount: events.length === 0 ? null : events.length,
      latestEventAt,
      now,
      status
    }),
    bookmarks: {
      historyByteOffset: history.bookmark?.byteOffset ?? input.bookmarks?.historyByteOffset ?? 0
    },
    events,
    diagnostics
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
}): ProviderCard {
  const confidence = deriveProviderConfidence({
    providerId: "codex",
    requestedConfidence: "estimated",
    sources: ["local-history", "local-sessions"]
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
    adapterMode: "passive",
    confidenceExplanation: explainProviderConfidence({
      providerId: "codex",
      confidence,
      source: "local-history"
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
