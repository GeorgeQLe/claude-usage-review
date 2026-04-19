import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { ProviderId } from "../../shared/types/provider.js";
import { redactText } from "./redaction.js";

export interface WrapperEventStoreOptions {
  readonly database: DatabaseSync;
  readonly idFactory?: () => string;
  readonly now?: () => string;
}

export interface WrapperLimitSignalInput {
  readonly limitHit?: boolean;
  readonly redactedDiagnostics?: readonly string[];
  readonly resetAt?: string | null;
  readonly resetHint?: string | null;
}

export interface RecordWrapperInvocationStartedInput {
  readonly commandMode?: string | null;
  readonly invocationId: string;
  readonly model?: string | null;
  readonly providerId: ProviderId;
  readonly startedAt?: string | null;
  readonly wrapperVersion?: string | null;
}

export interface RecordWrapperInvocationFinishedInput {
  readonly endedAt?: string | null;
  readonly exitStatus?: number | null;
  readonly invocationId: string;
  readonly providerId: ProviderId;
  readonly stderrLimitSignal?: WrapperLimitSignalInput | null;
  readonly stdout?: string | null;
}

export interface ListRecentWrapperEventsFilters {
  readonly limit?: number;
  readonly providerId?: ProviderId;
  readonly since?: string;
}

export interface SummarizeWrapperEventsFilters {
  readonly providerId: ProviderId;
  readonly since?: string;
}

export interface WrapperEventRecord {
  readonly id: string;
  readonly commandMode: string | null;
  readonly durationMs: number | null;
  readonly endedAt: string | null;
  readonly exitStatus: number | null;
  readonly invocationId: string;
  readonly limitHit: boolean;
  readonly model: string | null;
  readonly providerId: ProviderId;
  readonly startedAt: string;
  readonly wrapperVersion: string | null;
}

export interface WrapperEventsSummary {
  readonly providerId: ProviderId;
  readonly invocationCount: number;
  readonly limitHitCount: number;
  readonly latestStartedAt: string | null;
  readonly latestEndedAt: string | null;
}

export interface WrapperEventStore {
  readonly recordWrapperInvocationStarted: (input: RecordWrapperInvocationStartedInput) => WrapperEventRecord;
  readonly recordWrapperInvocationFinished: (input: RecordWrapperInvocationFinishedInput) => WrapperEventRecord;
  readonly listRecentWrapperEvents: (filters?: ListRecentWrapperEventsFilters) => readonly WrapperEventRecord[];
  readonly summarizeWrapperEvents: (filters: SummarizeWrapperEventsFilters) => WrapperEventsSummary;
}

interface WrapperEventRow {
  readonly id: string;
  readonly provider_id: string;
  readonly invocation_id: string;
  readonly started_at: string;
  readonly ended_at: string | null;
  readonly duration_ms: number | null;
  readonly command_mode: string | null;
  readonly model: string | null;
  readonly exit_status: number | null;
  readonly limit_hit: number;
  readonly source_version: string | null;
}

interface WrapperEventsSummaryRow {
  readonly invocation_count: number;
  readonly limit_hit_count: number;
  readonly latest_started_at: string | null;
  readonly latest_ended_at: string | null;
}

const defaultLimit = 50;
const maxLimit = 500;

export function createWrapperEventStore(options: WrapperEventStoreOptions): WrapperEventStore {
  const database = options.database;
  const idFactory = options.idFactory ?? randomUUID;
  const now = options.now ?? (() => new Date().toISOString());

  return {
    recordWrapperInvocationStarted: (input: RecordWrapperInvocationStartedInput): WrapperEventRecord => {
      const providerId = normalizeProviderId(input.providerId);
      const invocationId = normalizeRequiredText(input.invocationId, "invocationId");
      const startedAt = normalizeIsoLike(input.startedAt ?? now(), "startedAt");
      const id = idFactory();

      try {
        database
          .prepare(
            `
              INSERT INTO wrapper_events (
                id,
                provider_id,
                invocation_id,
                started_at,
                ended_at,
                duration_ms,
                command_mode,
                model,
                exit_status,
                limit_hit,
                source_version,
                created_at
              )
              VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, NULL, 0, ?, ?);
            `
          )
          .run(
            id,
            providerId,
            invocationId,
            startedAt,
            sanitizeDerivedText(input.commandMode ?? null),
            sanitizeDerivedText(input.model ?? null),
            sanitizeDerivedText(input.wrapperVersion ?? null),
            now()
          );
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new Error(`Duplicate wrapper invocation for ${providerId}: ${invocationId}`);
        }
        throw error;
      }

      return getWrapperEventOrThrow(database, providerId, invocationId);
    },
    recordWrapperInvocationFinished: (input: RecordWrapperInvocationFinishedInput): WrapperEventRecord => {
      const providerId = normalizeProviderId(input.providerId);
      const invocationId = normalizeRequiredText(input.invocationId, "invocationId");
      const existing = getWrapperEventOrThrow(database, providerId, invocationId);
      const endedAt = normalizeIsoLike(input.endedAt ?? now(), "endedAt");
      const durationMs = deriveDurationMs(existing.startedAt, endedAt);
      const limitHit = input.stderrLimitSignal?.limitHit === true ? 1 : existing.limitHit ? 1 : 0;

      database
        .prepare(
          `
            UPDATE wrapper_events
            SET
              ended_at = ?,
              duration_ms = ?,
              exit_status = ?,
              limit_hit = ?
            WHERE provider_id = ? AND invocation_id = ?;
          `
        )
        .run(endedAt, durationMs, normalizeExitStatus(input.exitStatus), limitHit, providerId, invocationId);

      return getWrapperEventOrThrow(database, providerId, invocationId);
    },
    listRecentWrapperEvents: (filters: ListRecentWrapperEventsFilters = {}): readonly WrapperEventRecord[] => {
      const { whereClause, params } = buildWrapperEventFilters(filters);
      const rows = database
        .prepare(
          `
            SELECT
              id,
              provider_id,
              invocation_id,
              started_at,
              ended_at,
              duration_ms,
              command_mode,
              model,
              exit_status,
              limit_hit,
              source_version
            FROM wrapper_events
            ${whereClause}
            ORDER BY started_at DESC, id DESC
            LIMIT ?;
          `
        )
        .all(...params, normalizeLimit(filters.limit)) as unknown as WrapperEventRow[];

      return rows.map(mapWrapperEventRow);
    },
    summarizeWrapperEvents: (filters: SummarizeWrapperEventsFilters): WrapperEventsSummary => {
      const { whereClause, params } = buildWrapperEventFilters({
        providerId: filters.providerId,
        since: filters.since
      });
      const row = database
        .prepare(
          `
            SELECT
              COUNT(*) AS invocation_count,
              COALESCE(SUM(limit_hit), 0) AS limit_hit_count,
              MAX(started_at) AS latest_started_at,
              MAX(ended_at) AS latest_ended_at
            FROM wrapper_events
            ${whereClause};
          `
        )
        .get(...params) as unknown as WrapperEventsSummaryRow;

      return {
        providerId: filters.providerId,
        invocationCount: row.invocation_count,
        limitHitCount: row.limit_hit_count,
        latestStartedAt: row.latest_started_at,
        latestEndedAt: row.latest_ended_at
      };
    }
  };
}

function buildWrapperEventFilters(filters: ListRecentWrapperEventsFilters): {
  readonly whereClause: string;
  readonly params: readonly string[];
} {
  const clauses: string[] = [];
  const params: string[] = [];

  if (filters.providerId !== undefined) {
    clauses.push("provider_id = ?");
    params.push(normalizeProviderId(filters.providerId));
  }

  if (filters.since !== undefined) {
    clauses.push("started_at >= ?");
    params.push(normalizeIsoLike(filters.since, "since"));
  }

  return {
    whereClause: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    params
  };
}

function getWrapperEventOrThrow(database: DatabaseSync, providerId: ProviderId, invocationId: string): WrapperEventRecord {
  const row = database
    .prepare(
      `
        SELECT
          id,
          provider_id,
          invocation_id,
          started_at,
          ended_at,
          duration_ms,
          command_mode,
          model,
          exit_status,
          limit_hit,
          source_version
        FROM wrapper_events
        WHERE provider_id = ? AND invocation_id = ?;
      `
    )
    .get(providerId, invocationId) as WrapperEventRow | undefined;

  if (!row) {
    throw new Error(`Unknown wrapper invocation for ${providerId}: ${invocationId}`);
  }

  return mapWrapperEventRow(row);
}

function mapWrapperEventRow(row: WrapperEventRow): WrapperEventRecord {
  return {
    id: row.id,
    commandMode: row.command_mode,
    durationMs: row.duration_ms,
    endedAt: row.ended_at,
    exitStatus: row.exit_status,
    invocationId: row.invocation_id,
    limitHit: row.limit_hit === 1,
    model: row.model,
    providerId: row.provider_id,
    startedAt: row.started_at,
    wrapperVersion: row.source_version
  };
}

function normalizeProviderId(providerId: ProviderId): ProviderId {
  return normalizeRequiredText(providerId, "providerId") as ProviderId;
}

function normalizeRequiredText(value: string, fieldName: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`Missing wrapper event ${fieldName}`);
  }

  return trimmed;
}

function sanitizeDerivedText(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const redacted = redactText(value).trim();
  if (!redacted) {
    return null;
  }

  return redacted.slice(0, 200);
}

function normalizeIsoLike(value: string, fieldName: string): string {
  const trimmed = value.trim();
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid wrapper event ${fieldName}: expected an ISO timestamp`);
  }

  return new Date(parsed).toISOString();
}

function normalizeExitStatus(value: number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (!Number.isInteger(value)) {
    throw new Error("Invalid wrapper event exitStatus: expected an integer");
  }

  return value;
}

function normalizeLimit(value: number | undefined): number {
  if (value === undefined) {
    return defaultLimit;
  }

  if (!Number.isInteger(value) || value < 1) {
    return defaultLimit;
  }

  return Math.min(value, maxLimit);
}

function deriveDurationMs(startedAt: string, endedAt: string): number {
  const startedMs = Date.parse(startedAt);
  const endedMs = Date.parse(endedAt);

  if (!Number.isFinite(startedMs) || !Number.isFinite(endedMs)) {
    return 0;
  }

  return Math.max(0, endedMs - startedMs);
}

function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return /unique|constraint/iu.test(error.message);
}
