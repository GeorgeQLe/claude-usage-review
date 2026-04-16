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

export interface UsageHistoryStore {
  readonly recordClaudeUsageSnapshot: (input: RecordClaudeUsageSnapshotInput) => UsageSnapshotSummary;
  readonly listRecentSnapshots: (filters?: ListRecentSnapshotsFilters) => readonly UsageSnapshotSummary[];
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

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return DEFAULT_LIMIT;
  }

  if (!Number.isFinite(limit)) {
    return DEFAULT_LIMIT;
  }

  return Math.max(1, Math.min(Math.trunc(limit), MAX_LIMIT));
}

function createDefaultSnapshotId(): string {
  return `usage-snapshot-${randomUUID()}`;
}
