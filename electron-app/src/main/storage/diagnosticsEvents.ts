import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { redactDiagnosticPayload, redactText } from "./redaction.js";

export type DiagnosticsEventLevel = "debug" | "info" | "warn" | "error";

export interface DiagnosticsEventRecord {
  readonly id: string;
  readonly level: DiagnosticsEventLevel;
  readonly source: string;
  readonly message: string;
  readonly metadata: unknown | null;
  readonly createdAt: string;
}

export interface DiagnosticsEventStoreOptions {
  readonly database: DatabaseSync;
  readonly idFactory?: () => string;
  readonly now?: () => string;
}

export interface ListRecentDiagnosticsEventsFilters {
  readonly limit?: number;
  readonly minimumLevel?: DiagnosticsEventLevel;
}

export interface DiagnosticsEventStore {
  readonly recordDiagnosticsEvent: (input: {
    readonly level: DiagnosticsEventLevel;
    readonly source: string;
    readonly message: string;
    readonly metadata?: unknown;
  }) => DiagnosticsEventRecord;
  readonly listRecentDiagnosticsEvents: (
    filters?: ListRecentDiagnosticsEventsFilters
  ) => readonly DiagnosticsEventRecord[];
}

interface DiagnosticsEventRow {
  readonly id: string;
  readonly level: DiagnosticsEventLevel;
  readonly source: string;
  readonly message: string;
  readonly metadata_json: string | null;
  readonly created_at: string;
}

const levelRank: Record<DiagnosticsEventLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};
const defaultLimit = 25;
const maxLimit = 100;

export function createDiagnosticsEventStore(options: DiagnosticsEventStoreOptions): DiagnosticsEventStore {
  const database = options.database;
  const idFactory = options.idFactory ?? randomUUID;
  const now = options.now ?? (() => new Date().toISOString());

  return {
    recordDiagnosticsEvent: (input): DiagnosticsEventRecord => {
      const id = idFactory();
      const createdAt = now();
      const metadata = input.metadata === undefined ? null : redactDiagnosticPayload(input.metadata);

      database
        .prepare(
          `
            INSERT INTO diagnostics_events (id, level, source, message, metadata_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?);
          `
        )
        .run(
          id,
          normalizeLevel(input.level),
          sanitizeDiagnosticText(input.source).slice(0, 120),
          sanitizeDiagnosticText(input.message).slice(0, 500),
          metadata === null ? null : JSON.stringify(metadata),
          createdAt
        );

      return {
        id,
        createdAt,
        level: normalizeLevel(input.level),
        metadata,
        message: sanitizeDiagnosticText(input.message).slice(0, 500),
        source: sanitizeDiagnosticText(input.source).slice(0, 120)
      };
    },
    listRecentDiagnosticsEvents: (filters = {}): readonly DiagnosticsEventRecord[] => {
      const rows = database
        .prepare(
          `
            SELECT id, level, source, message, metadata_json, created_at
            FROM diagnostics_events
            ORDER BY created_at DESC, id DESC
            LIMIT ?;
          `
        )
        .all(normalizeLimit(filters.limit)) as unknown as DiagnosticsEventRow[];
      const minimumRank = filters.minimumLevel ? levelRank[normalizeLevel(filters.minimumLevel)] : 0;

      return rows.map(mapDiagnosticsEventRow).filter((event) => levelRank[event.level] >= minimumRank);
    }
  };
}

function mapDiagnosticsEventRow(row: DiagnosticsEventRow): DiagnosticsEventRecord {
  const metadata = row.metadata_json ? redactDiagnosticPayload(JSON.parse(row.metadata_json)) : null;

  return {
    id: row.id,
    createdAt: row.created_at,
    level: normalizeLevel(row.level),
    metadata,
    message: sanitizeDiagnosticText(row.message).slice(0, 500),
    source: sanitizeDiagnosticText(row.source).slice(0, 120)
  };
}

function sanitizeDiagnosticText(value: string): string {
  return redactText(value).replace(
    /(access[_-]?token|api[_-]?key|authorization|bearer|cookie|session[_-]?key|github[_-]?token|provider[_-]?auth|raw prompt|prompt|raw stdout|stdout|raw stderr|stderr|oauth[_-]?creds)/giu,
    "redacted"
  );
}

function normalizeLevel(level: DiagnosticsEventLevel): DiagnosticsEventLevel {
  return Object.hasOwn(levelRank, level) ? level : "info";
}

function normalizeLimit(value: number | undefined): number {
  if (!Number.isInteger(value) || value === undefined || value < 1) {
    return defaultLimit;
  }

  return Math.min(value, maxLimit);
}
