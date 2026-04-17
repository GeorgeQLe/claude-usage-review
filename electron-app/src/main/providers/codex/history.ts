import { readFile, stat } from "node:fs/promises";

export interface CodexHistoryBookmark {
  readonly byteOffset: number;
}

export interface ParseCodexHistoryInput {
  readonly historyPath: string;
  readonly bookmark?: CodexHistoryBookmark | null;
}

export interface CodexDerivedEvent {
  readonly occurredAt: string;
  readonly source: "history-jsonl" | "session-jsonl";
  readonly model?: string;
  readonly tokenCount?: number;
  readonly limitHit?: boolean;
  readonly cooldownUntil?: string;
}

export interface ParseCodexHistoryResult {
  readonly bookmark: CodexHistoryBookmark;
  readonly events: readonly CodexDerivedEvent[];
  readonly diagnostics: readonly string[];
}

export async function parseCodexHistory(input: ParseCodexHistoryInput): Promise<ParseCodexHistoryResult> {
  const diagnostics: string[] = [];

  try {
    const fileStat = await stat(input.historyPath);
    const requestedOffset = input.bookmark?.byteOffset ?? 0;
    const byteOffset = requestedOffset > fileStat.size || requestedOffset < 0 ? 0 : requestedOffset;
    if (byteOffset !== requestedOffset) {
      diagnostics.push("Codex history bookmark was reset after file truncation.");
    }

    const buffer = await readFile(input.historyPath);
    const slice = buffer.subarray(byteOffset);
    const events = parseJsonlLines(slice.toString("utf8"), "history-jsonl", diagnostics);

    return {
      bookmark: { byteOffset: buffer.byteLength },
      events,
      diagnostics
    };
  } catch (error) {
    const code = isNodeError(error) ? error.code : null;
    return {
      bookmark: { byteOffset: input.bookmark?.byteOffset ?? 0 },
      events: [],
      diagnostics: [code === "ENOENT" ? "Codex history file not found." : "Codex history could not be read."]
    };
  }
}

export function parseCodexHistoryLine(
  value: unknown,
  source: CodexDerivedEvent["source"]
): CodexDerivedEvent | null {
  if (!isRecord(value)) {
    return null;
  }

  const occurredAt = readTimestamp(value);
  if (!occurredAt) {
    return null;
  }

  const model = readString(value.model);
  const tokenCount = readNumber(value.token_count) ?? readNumber(value.tokenCount) ?? readNumber(value.tokens);
  const message = [readString(value.message), readString(value.error), readString(value.status)]
    .filter((part): part is string => Boolean(part))
    .join(" ");
  const limitHit = value.limit_hit === true || value.limitHit === true || containsLimitHit(message);
  const cooldownUntil = limitHit ? parseCooldownUntil(message, occurredAt) : null;

  if (!model && tokenCount === null && !limitHit && source === "session-jsonl") {
    return null;
  }

  return {
    occurredAt,
    source,
    ...(model ? { model } : {}),
    ...(tokenCount !== null ? { tokenCount } : {}),
    ...(limitHit ? { limitHit: true } : {}),
    ...(cooldownUntil ? { cooldownUntil } : {})
  };
}

export function parseCooldownUntil(message: string, occurredAt: string): string | null {
  const baseMs = Date.parse(occurredAt);
  if (!Number.isFinite(baseMs)) {
    return null;
  }

  const minutesMatch = /\b(?:try again|retry|reset)[^0-9]*(?:in\s+)?(\d{1,4})\s*(?:minute|minutes|min|mins)\b/iu.exec(
    message
  );
  if (minutesMatch?.[1]) {
    return new Date(baseMs + Number(minutesMatch[1]) * 60 * 1000).toISOString();
  }

  const timeMatch = /\b(?:try again|retry|reset)[^0-9]*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/iu.exec(message);
  if (timeMatch?.[1]) {
    const base = new Date(baseMs);
    const hour12 = Number(timeMatch[1]);
    const minute = timeMatch[2] ? Number(timeMatch[2]) : 0;
    const meridiem = timeMatch[3]?.toLowerCase();
    let hour = hour12 % 12;
    if (meridiem === "pm") {
      hour += 12;
    }

    const cooldown = new Date(base);
    cooldown.setHours(hour, minute, 0, 0);
    if (cooldown.getTime() < baseMs) {
      cooldown.setDate(cooldown.getDate() + 1);
    }
    return cooldown.toISOString();
  }

  return null;
}

export function containsLimitHit(message: string): boolean {
  return /\b(rate limit|usage limit|limit exceeded|hit the .*limit|cooldown|try again)\b/iu.test(message);
}

function parseJsonlLines(
  text: string,
  source: CodexDerivedEvent["source"],
  diagnostics: string[]
): readonly CodexDerivedEvent[] {
  const events: CodexDerivedEvent[] = [];

  for (const line of text.split(/\r?\n/u)) {
    if (!line.trim()) {
      continue;
    }

    try {
      const event = parseCodexHistoryLine(JSON.parse(line), source);
      if (event) {
        events.push(event);
      }
    } catch {
      diagnostics.push("Codex history contained a malformed JSONL entry.");
    }
  }

  return events;
}

function readTimestamp(value: Record<string, unknown>): string | null {
  const timestamp = readString(value.timestamp) ?? readString(value.created_at) ?? readString(value.createdAt);
  if (!timestamp || !Number.isFinite(Date.parse(timestamp))) {
    return null;
  }
  return new Date(timestamp).toISOString();
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
