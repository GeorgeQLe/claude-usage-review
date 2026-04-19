import type { ProviderId } from "../../shared/types/provider.js";
import { redactText } from "../storage/redaction.js";

export interface ScanWrapperStderrInput {
  readonly providerId: ProviderId;
  readonly stderr?: string | null;
  readonly stdout?: string | null;
}

export interface WrapperLimitSignal {
  readonly providerId: ProviderId;
  readonly limitHit: boolean;
  readonly resetAt: string | null;
  readonly resetHint: string | null;
  readonly redactedDiagnostics: readonly string[];
}

const limitPatternsByProvider: Record<string, readonly RegExp[]> = {
  codex: [
    /\brate limit\b/iu,
    /\busage limit\b/iu,
    /\blimit reached\b/iu,
    /\bquota\b/iu,
    /\bcooldown\b/iu,
    /\blocked out\b/iu,
    /\btry again\b/iu,
    /\breset\b/iu
  ],
  gemini: [
    /\brate limit\b/iu,
    /\bquota\b/iu,
    /\bexhausted\b/iu,
    /\bcooldown\b/iu,
    /\blocked out\b/iu,
    /\blockout\b/iu,
    /\btry again\b/iu,
    /\breset\b/iu
  ]
};

const isoTimestampPattern = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z\b/u;
const resetHintPatterns: readonly RegExp[] = [
  /\btry again (?:at|after)\s+([^.;\n]+)/iu,
  /\bcooldown until\s+([^.;\n]+)/iu,
  /\breset(?:s| at| after| by)?\s+([^.;\n]+)/iu
];

export function scanWrapperStderrForLimitSignals(input: ScanWrapperStderrInput): WrapperLimitSignal {
  const stderr = input.stderr ?? "";
  const matchingLines = stderr
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && matchesLimitSignal(input.providerId, line));
  const limitHit = matchingLines.length > 0;
  const resetAt = readResetAt(stderr);
  const resetHint = readResetHint(stderr);

  return {
    providerId: input.providerId,
    limitHit,
    resetAt,
    resetHint,
    redactedDiagnostics: limitHit ? matchingLines.map(redactDiagnosticLine).slice(0, 5) : []
  };
}

function matchesLimitSignal(providerId: ProviderId, line: string): boolean {
  const patterns = limitPatternsByProvider[providerId] ?? [...limitPatternsByProvider.codex, ...limitPatternsByProvider.gemini];
  return patterns.some((pattern) => pattern.test(line));
}

function readResetAt(stderr: string): string | null {
  const match = isoTimestampPattern.exec(stderr);
  if (!match) {
    return null;
  }

  const parsed = new Date(match[0]);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function readResetHint(stderr: string): string | null {
  for (const pattern of resetHintPatterns) {
    const match = pattern.exec(stderr);
    const hint = match?.[1]?.trim();
    if (hint) {
      return redactText(hint);
    }
  }

  return null;
}

function redactDiagnosticLine(line: string): string {
  return redactText(line).replace(/\s+/gu, " ").trim();
}
