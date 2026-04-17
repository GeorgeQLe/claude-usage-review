import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { Dirent } from "node:fs";

export interface ParseGeminiSessionTreeInput {
  readonly rootDir: string;
  readonly now?: Date;
}

export interface GeminiDerivedEvent {
  readonly occurredAt: string;
  readonly source: "chat-session";
  readonly model?: string;
  readonly tokenCount?: number;
}

export interface GeminiSessionSummary {
  readonly dailyRequestCount: number;
  readonly lastObservedAt: string | null;
  readonly model: string | null;
  readonly requestsPerMinute: number;
  readonly tokenCount: number;
}

export interface ParseGeminiSessionTreeResult {
  readonly summary: GeminiSessionSummary;
  readonly events: readonly GeminiDerivedEvent[];
  readonly diagnostics: readonly string[];
  readonly filesScanned: number;
}

export async function parseGeminiSessionTree(input: ParseGeminiSessionTreeInput): Promise<ParseGeminiSessionTreeResult> {
  const now = input.now ?? new Date();
  const diagnostics: string[] = [];
  const events: GeminiDerivedEvent[] = [];
  let filesScanned = 0;

  for (const filePath of await listSessionFiles(path.join(input.rootDir, "tmp"))) {
    filesScanned += 1;
    const parsed = await parseSessionFile(filePath);
    events.push(...parsed.events);
    diagnostics.push(...parsed.diagnostics);
  }

  return {
    summary: summarizeGeminiEvents(events, now),
    events,
    diagnostics,
    filesScanned
  };
}

export function summarizeGeminiEvents(events: readonly GeminiDerivedEvent[], now: Date): GeminiSessionSummary {
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const nowMs = now.getTime();
  let dailyRequestCount = 0;
  let requestsPerMinute = 0;
  let tokenCount = 0;
  let latestMs: number | null = null;
  let latestModel: string | null = null;

  for (const event of events) {
    const occurredAtMs = Date.parse(event.occurredAt);
    if (!Number.isFinite(occurredAtMs)) {
      continue;
    }

    if (occurredAtMs >= dayStart && occurredAtMs <= nowMs) {
      dailyRequestCount += 1;
      tokenCount += event.tokenCount ?? 0;
    }

    if (occurredAtMs <= nowMs && nowMs - occurredAtMs <= 60 * 1000) {
      requestsPerMinute += 1;
    }

    if (latestMs === null || occurredAtMs > latestMs) {
      latestMs = occurredAtMs;
      latestModel = event.model ?? latestModel;
    } else if (event.model && latestModel === null) {
      latestModel = event.model;
    }
  }

  return {
    dailyRequestCount,
    lastObservedAt: latestMs === null ? null : new Date(latestMs).toISOString(),
    model: latestModel,
    requestsPerMinute,
    tokenCount
  };
}

function parseSessionValue(value: unknown): readonly GeminiDerivedEvent[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => eventToArray(parseMessageValue(entry)));
  }

  if (!isRecord(value)) {
    return [];
  }

  const messages = Array.isArray(value.messages)
    ? value.messages
    : Array.isArray(value.conversation)
      ? value.conversation
      : Array.isArray(value.entries)
        ? value.entries
        : null;

  if (messages) {
    return messages.flatMap((entry) => eventToArray(parseMessageValue(entry)));
  }

  const event = parseMessageValue(value);
  return event ? [event] : [];
}

function eventToArray(event: GeminiDerivedEvent | null): readonly GeminiDerivedEvent[] {
  return event ? [event] : [];
}

function parseMessageValue(value: unknown): GeminiDerivedEvent | null {
  if (!isRecord(value) || !isModelMessage(value)) {
    return null;
  }

  const occurredAt = readTimestamp(value);
  if (!occurredAt) {
    return null;
  }

  const model = readString(value.model) ?? readString(value.modelName) ?? readString(value.model_name);
  const tokenCount = readTokenCount(value);

  return {
    occurredAt,
    source: "chat-session",
    ...(model ? { model } : {}),
    ...(tokenCount !== null ? { tokenCount } : {})
  };
}

function isModelMessage(value: Record<string, unknown>): boolean {
  const role = readString(value.role)?.toLowerCase();
  if (role === "model" || role === "assistant") {
    return true;
  }

  return readString(value.model) !== null || readString(value.modelName) !== null || readString(value.model_name) !== null;
}

function readTimestamp(value: Record<string, unknown>): string | null {
  const timestamp =
    readString(value.timestamp) ??
    readString(value.createdAt) ??
    readString(value.created_at) ??
    readString(value.time);
  if (!timestamp || !Number.isFinite(Date.parse(timestamp))) {
    return null;
  }

  return new Date(timestamp).toISOString();
}

function readTokenCount(value: Record<string, unknown>): number | null {
  const usage = isRecord(value.usage) ? value.usage : isRecord(value.usageMetadata) ? value.usageMetadata : null;
  const candidates = usage ? [usage, value] : [value];

  for (const candidate of candidates) {
    const total =
      readNumber(candidate.totalTokens) ??
      readNumber(candidate.total_tokens) ??
      readNumber(candidate.tokenCount) ??
      readNumber(candidate.token_count) ??
      readNumber(candidate.tokens);
    if (total !== null) {
      return total;
    }

    const inputTokens =
      readNumber(candidate.inputTokens) ??
      readNumber(candidate.input_tokens) ??
      readNumber(candidate.promptTokenCount) ??
      readNumber(candidate.prompt_token_count);
    const outputTokens =
      readNumber(candidate.outputTokens) ??
      readNumber(candidate.output_tokens) ??
      readNumber(candidate.candidatesTokenCount) ??
      readNumber(candidate.candidates_token_count);

    if (inputTokens !== null || outputTokens !== null) {
      return (inputTokens ?? 0) + (outputTokens ?? 0);
    }
  }

  return null;
}

async function parseSessionFile(filePath: string): Promise<{
  readonly events: readonly GeminiDerivedEvent[];
  readonly diagnostics: readonly string[];
}> {
  try {
    const text = await readFile(filePath, "utf8");
    return {
      events: parseSessionValue(JSON.parse(text)),
      diagnostics: []
    };
  } catch {
    return {
      events: [],
      diagnostics: [`${path.basename(filePath)} could not be parsed.`]
    };
  }
}

async function listSessionFiles(rootDir: string): Promise<readonly string[]> {
  const files: string[] = [];

  async function walk(currentDir: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
        continue;
      }

      if (entry.isFile() && /^session-.*\.json$/u.test(entry.name) && path.basename(path.dirname(entryPath)) === "chats") {
        files.push(entryPath);
      }
    }
  }

  await walk(rootDir);
  return files.sort();
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
