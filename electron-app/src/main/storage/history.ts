import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { AccountId } from "../../shared/types/accounts.js";
import type { ProviderId } from "../../shared/types/provider.js";
import { claudeUsageDataSchema, type ClaudeUsageData } from "../../shared/schemas/claudeUsage.js";

export interface UsageHistoryStoreOptions {
  readonly database: DatabaseSync;
  readonly idFactory?: () => string;
  readonly now?: () => string;
}

export interface RecordClaudeUsageSnapshotInput {
  readonly accountId: AccountId | null;
  readonly providerId?: ProviderId;
  readonly usage: ClaudeUsageData;
  readonly capturedAt?: string;
}

export interface ListRecentSnapshotsFilters {
  readonly accountId?: AccountId | null;
  readonly providerId?: ProviderId;
  readonly limit?: number;
}

export interface ListUsageHistoryFilters {
  readonly accountId?: AccountId | null;
  readonly providerId?: ProviderId;
  readonly now?: string;
}

export interface UsageSnapshotSummary {
  readonly id: string;
  readonly accountId: AccountId | null;
  readonly providerId: ProviderId;
  readonly capturedAt: string;
  readonly sessionUtilization: number | null;
  readonly weeklyUtilization: number | null;
  readonly resetAt: string | null;
  readonly payload: ClaudeUsageData;
}

export interface UsageHistoryPoint {
  readonly capturedAt: string;
  readonly accountId: AccountId | null;
  readonly providerId: ProviderId;
  readonly sessionUtilization: number | null;
  readonly weeklyUtilization: number | null;
  readonly resetAt: string | null;
}

export interface UsageHistorySummary {
  readonly points: readonly UsageHistoryPoint[];
  readonly generatedAt: string;
}

export interface UsageHistoryStore {
  readonly recordClaudeUsageSnapshot: (input: RecordClaudeUsageSnapshotInput) => UsageSnapshotSummary;
  readonly listRecentSnapshots: (filters?: ListRecentSnapshotsFilters) => readonly UsageSnapshotSummary[];
  readonly listUsageHistory: (filters?: ListUsageHistoryFilters) => UsageHistorySummary;
}

interface UsageSnapshotRow {
  readonly id: string;
  readonly account_id: string | null;
  readonly provider_id: string;
  readonly captured_at: string;
  readonly session_utilization: number | null;
  readonly weekly_utilization: number | null;
  readonly reset_at: string | null;
  readonly payload_json: string;
}

const DEFAULT_PROVIDER_ID: ProviderId = "claude";
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;
const HISTORY_TOTAL_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const HISTORY_RAW_WINDOW_MS = 24 * 60 * 60 * 1000;
const HISTORY_BUCKET_MS = 60 * 60 * 1000;

export function createUsageHistoryStore(options: UsageHistoryStoreOptions): UsageHistoryStore {
  const database = options.database;
  const idFactory = options.idFactory ?? createDefaultSnapshotId;
  const now = options.now ?? (() => new Date().toISOString());

  return {
    recordClaudeUsageSnapshot: (input: RecordClaudeUsageSnapshotInput): UsageSnapshotSummary => {
      const payload = claudeUsageDataSchema.parse(input.usage);
      const capturedAt = input.capturedAt ?? now();
      const snapshotId = idFactory();
      const providerId = input.providerId ?? DEFAULT_PROVIDER_ID;

      database
        .prepare(
          `
            INSERT INTO usage_snapshots (
              id,
              account_id,
              provider_id,
              captured_at,
              session_utilization,
              weekly_utilization,
              daily_request_count,
              requests_per_minute,
              reset_at,
              payload_json
            )
            VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?);
          `
        )
        .run(
          snapshotId,
          input.accountId,
          providerId,
          capturedAt,
          payload.fiveHour.utilization,
          payload.sevenDay.utilization,
          payload.fiveHour.resetsAt,
          JSON.stringify(payload)
        );

      return getSnapshotOrThrow(database, snapshotId);
    },
    listRecentSnapshots: (filters: ListRecentSnapshotsFilters = {}): readonly UsageSnapshotSummary[] => {
      const { whereClause, params } = buildSnapshotFilters(filters);
      const rows = database
        .prepare(
          `
            SELECT id, account_id, provider_id, captured_at, session_utilization, weekly_utilization, reset_at, payload_json
            FROM usage_snapshots
            ${whereClause}
            ORDER BY captured_at DESC, id DESC
            LIMIT ?;
          `
        )
        .all(...params, normalizeLimit(filters.limit)) as unknown as UsageSnapshotRow[];

      return rows.map(mapSnapshotRow);
    },
    listUsageHistory: (filters: ListUsageHistoryFilters = {}): UsageHistorySummary => {
      const generatedAt = normalizeNow(filters.now ?? now());
      const generatedTime = Date.parse(generatedAt);

      if (!Number.isFinite(generatedTime)) {
        return {
          generatedAt,
          points: []
        };
      }

      const { whereClause, params } = buildSnapshotFilters({
        accountId: filters.accountId,
        providerId: filters.providerId ?? DEFAULT_PROVIDER_ID
      });
      const cutoffAt = new Date(generatedTime - HISTORY_TOTAL_WINDOW_MS).toISOString();
      const rows = database
        .prepare(
          `
            SELECT id, account_id, provider_id, captured_at, session_utilization, weekly_utilization, reset_at, payload_json
            FROM usage_snapshots
            ${appendHistoryTimeClause(whereClause)}
            ORDER BY captured_at ASC, id ASC;
          `
        )
        .all(...params, cutoffAt, generatedAt) as unknown as UsageSnapshotRow[];

      return {
        generatedAt,
        points: compactHistoryRows(rows, generatedTime)
      };
    }
  };
}

function buildSnapshotFilters(filters: ListRecentSnapshotsFilters): {
  readonly whereClause: string;
  readonly params: readonly (string | null)[];
} {
  const clauses: string[] = [];
  const params: (string | null)[] = [];

  if (filters.providerId !== undefined) {
    clauses.push("provider_id = ?");
    params.push(filters.providerId);
  }

  if (filters.accountId !== undefined) {
    if (filters.accountId === null) {
      clauses.push("account_id IS NULL");
    } else {
      clauses.push("account_id = ?");
      params.push(filters.accountId);
    }
  }

  return {
    whereClause: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    params
  };
}

function getSnapshotOrThrow(database: DatabaseSync, snapshotId: string): UsageSnapshotSummary {
  const row = database
    .prepare(
      `
        SELECT id, account_id, provider_id, captured_at, session_utilization, weekly_utilization, reset_at, payload_json
        FROM usage_snapshots
        WHERE id = ?;
      `
    )
    .get(snapshotId) as UsageSnapshotRow | undefined;

  if (!row) {
    throw new Error(`Unknown usage snapshot: ${snapshotId}`);
  }

  return mapSnapshotRow(row);
}

function mapSnapshotRow(row: UsageSnapshotRow): UsageSnapshotSummary {
  return {
    id: row.id,
    accountId: row.account_id,
    providerId: row.provider_id,
    capturedAt: row.captured_at,
    sessionUtilization: row.session_utilization,
    weeklyUtilization: row.weekly_utilization,
    resetAt: row.reset_at,
    payload: claudeUsageDataSchema.parse(JSON.parse(row.payload_json))
  };
}

function mapHistoryPoint(row: UsageSnapshotRow): UsageHistoryPoint {
  return {
    accountId: row.account_id,
    providerId: row.provider_id,
    capturedAt: row.captured_at,
    sessionUtilization: row.session_utilization,
    weeklyUtilization: row.weekly_utilization,
    resetAt: row.reset_at
  };
}

function appendHistoryTimeClause(whereClause: string): string {
  const timeClause = "captured_at >= ? AND captured_at <= ?";

  if (whereClause) {
    return `${whereClause} AND ${timeClause}`;
  }

  return `WHERE ${timeClause}`;
}

function compactHistoryRows(rows: readonly UsageSnapshotRow[], generatedTime: number): readonly UsageHistoryPoint[] {
  const rawCutoffTime = generatedTime - HISTORY_RAW_WINDOW_MS;
  const hourlyBuckets = new Map<number, UsageSnapshotRow>();
  const rawRows: UsageSnapshotRow[] = [];

  for (const row of rows) {
    const capturedTime = Date.parse(row.captured_at);
    if (!Number.isFinite(capturedTime)) {
      continue;
    }

    if (capturedTime >= rawCutoffTime) {
      rawRows.push(row);
      continue;
    }

    const bucketTime = Math.floor(capturedTime / HISTORY_BUCKET_MS) * HISTORY_BUCKET_MS;
    const current = hourlyBuckets.get(bucketTime);
    if (!current || shouldReplaceHistoryBucket(current, row)) {
      hourlyBuckets.set(bucketTime, row);
    }
  }

  return [...Array.from(hourlyBuckets.values()), ...rawRows]
    .sort(compareHistoryRowsAscending)
    .map(mapHistoryPoint);
}

function shouldReplaceHistoryBucket(current: UsageSnapshotRow, candidate: UsageSnapshotRow): boolean {
  const currentSession = current.session_utilization ?? Number.NEGATIVE_INFINITY;
  const candidateSession = candidate.session_utilization ?? Number.NEGATIVE_INFINITY;

  if (candidateSession !== currentSession) {
    return candidateSession > currentSession;
  }

  return compareHistoryRowsAscending(current, candidate) < 0;
}

function compareHistoryRowsAscending(left: UsageSnapshotRow, right: UsageSnapshotRow): number {
  const byCapturedAt = left.captured_at.localeCompare(right.captured_at);
  if (byCapturedAt !== 0) {
    return byCapturedAt;
  }

  return left.id.localeCompare(right.id);
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return DEFAULT_LIMIT;
  }

  if (!Number.isFinite(limit)) {
    return DEFAULT_LIMIT;
  }

  return Math.max(1, Math.min(Math.trunc(limit), MAX_LIMIT));
}

function normalizeNow(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toISOString();
}

function createDefaultSnapshotId(): string {
  return `usage-snapshot-${randomUUID()}`;
}
