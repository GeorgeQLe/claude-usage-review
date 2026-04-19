import { basename } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { ProviderId } from "../../shared/types/provider.js";
import { redactDiagnosticPayload } from "./redaction.js";

export interface ParseBookmarkRecord {
  readonly providerId: ProviderId;
  readonly sourceName: string;
  readonly bookmark: unknown;
  readonly updatedAt: string;
}

export interface ParseBookmarkStoreOptions {
  readonly database: DatabaseSync;
}

export interface ParseBookmarkStore {
  readonly listParseBookmarks: (limit?: number) => readonly ParseBookmarkRecord[];
}

interface ParseBookmarkRow {
  readonly provider_id: string;
  readonly source_path: string;
  readonly bookmark_json: string;
  readonly updated_at: string;
}

const defaultLimit = 20;
const maxLimit = 100;

export function createParseBookmarkStore(options: ParseBookmarkStoreOptions): ParseBookmarkStore {
  return {
    listParseBookmarks: (limit?: number): readonly ParseBookmarkRecord[] => {
      const rows = options.database
        .prepare(
          `
            SELECT provider_id, source_path, bookmark_json, updated_at
            FROM parse_bookmarks
            ORDER BY updated_at DESC, provider_id ASC, source_path ASC
            LIMIT ?;
          `
        )
        .all(normalizeLimit(limit)) as unknown as ParseBookmarkRow[];

      return rows.map(mapParseBookmarkRow);
    }
  };
}

function mapParseBookmarkRow(row: ParseBookmarkRow): ParseBookmarkRecord {
  return {
    providerId: row.provider_id,
    sourceName: basename(row.source_path),
    bookmark: redactDiagnosticPayload(JSON.parse(row.bookmark_json)),
    updatedAt: row.updated_at
  };
}

function normalizeLimit(value: number | undefined): number {
  if (!Number.isInteger(value) || value === undefined || value < 1) {
    return defaultLimit;
  }

  return Math.min(value, maxLimit);
}
