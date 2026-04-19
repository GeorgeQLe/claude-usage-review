import { afterEach, describe, expect, it } from "vitest";
import { createDefaultAppSettings } from "../../shared/settings/defaults.js";
import type { UsageState } from "../../shared/types/usage.js";
import {
  createDiagnosticsEventStore,
  createMigrationRecordStore,
  createWrapperEventStore,
  openAppDatabase,
  type OpenedAppDatabase
} from "../storage/index.js";
import { createDiagnosticsService } from "./service.js";

describe("Phase 6 diagnostics export service", () => {
  let opened: OpenedAppDatabase | null = null;

  afterEach(() => {
    opened?.close();
    opened = null;
  });

  it("exports platform, storage, provider, wrapper, bookmark, migration, and redacted logs", () => {
    opened = openAppDatabase({ inMemory: true });
    const database = opened.database;

    createWrapperEventStore({
      database,
      now: () => "2026-04-18T12:00:00.000Z"
    }).recordWrapperInvocationStarted({
      invocationId: "codex-1",
      providerId: "codex",
      startedAt: "2026-04-18T11:59:00.000Z",
      wrapperVersion: "5.0.0"
    });
    createWrapperEventStore({ database }).recordWrapperInvocationFinished({
      endedAt: "2026-04-18T12:00:00.000Z",
      invocationId: "codex-1",
      providerId: "codex",
      stderrLimitSignal: {
        limitHit: true,
        redactedDiagnostics: ["raw stderr access_token=secret should stay redacted"]
      }
    });
    database
      .prepare(
        `
          INSERT INTO parse_bookmarks (provider_id, source_path, bookmark_json, updated_at)
          VALUES (?, ?, ?, ?);
        `
      )
      .run("codex", "/Users/example/.codex/history.jsonl", JSON.stringify({ byteOffset: 128 }), "2026-04-18T12:01:00.000Z");
    createMigrationRecordStore({
      database,
      now: () => "2026-04-18T12:02:00.000Z"
    }).recordMigration({
      source: "swift",
      status: "imported",
      summary: {
        sourceKind: "swift",
        sourcePath: "/Users/example/Library/Containers/ClaudeUsage",
        imported: {
          accounts: 1,
          appSettings: 1,
          historySnapshots: 2,
          providerSettings: 1
        },
        skippedSecretCategories: ["claude-session-key"],
        warnings: [],
        failures: []
      }
    });
    createDiagnosticsEventStore({
      database,
      now: () => "2026-04-18T12:03:00.000Z"
    }).recordDiagnosticsEvent({
      level: "warn",
      source: "provider-auth",
      message: "raw prompt and cookie diagnostics should be redacted",
      metadata: {
        access_token: "provider-secret",
        prompt: "private prompt text"
      }
    });

    const result = createDiagnosticsService({
      appName: "ClaudeUsage",
      appVersion: "0.1.0",
      database,
      databasePath: "/Users/example/Library/Application Support/ClaudeUsage/claude-usage.sqlite3",
      getSecretStorageStatus: () => ({
        available: true,
        backend: "basic_text",
        warning: "Electron safeStorage is using the Linux basic_text backend."
      }),
      getSettings: () => createDefaultAppSettings(),
      getUsageState: () => createUsageState(),
      now: () => "2026-04-18T12:04:00.000Z",
      platform: "linux"
    }).exportDiagnostics();

    const serialized = JSON.stringify(result);

    expect(result.summary).toContain("ClaudeUsage diagnostics export");
    expect(serialized).toContain("platform linux");
    expect(serialized).toContain("safeStorage available");
    expect(serialized).toContain("Codex wrapper: 1 invocations; 1 limit signals");
    expect(serialized).toContain("history.jsonl");
    expect(serialized).toContain("Migration: swift imported");
    expect(serialized).toContain("Recent log");
    expect(serialized).not.toMatch(
      /\/Users\/example|provider-secret|private prompt text|access[_-]?token|session[_-]?key|raw prompt|prompt|cookie|raw stderr|stderr/iu
    );
  });
});

function createUsageState(): UsageState {
  return {
    activeProviderId: "codex",
    lastUpdatedAt: "2026-04-18T12:00:00.000Z",
    providers: [
      {
        actions: ["refresh", "diagnostics"],
        adapterMode: "accuracy",
        confidence: "high_confidence",
        confidenceExplanation: "High confidence from wrapper events.",
        dailyRequestCount: 3,
        detailText: "history bookmark offset 128 with cookie detail",
        displayName: "Codex",
        enabled: true,
        headline: "Codex provider is ready",
        lastUpdatedAt: "2026-04-18T12:00:00.000Z",
        providerId: "codex",
        requestsPerMinute: 1,
        resetAt: null,
        sessionUtilization: null,
        status: "configured",
        weeklyUtilization: null
      },
      {
        actions: ["refresh", "diagnostics"],
        adapterMode: "passive",
        confidence: "observed_only",
        confidenceExplanation: "Gemini is not configured.",
        dailyRequestCount: null,
        detailText: null,
        displayName: "Gemini",
        enabled: false,
        headline: "Gemini missing configuration",
        lastUpdatedAt: null,
        providerId: "gemini",
        requestsPerMinute: null,
        resetAt: null,
        sessionUtilization: null,
        status: "missing_configuration",
        weeklyUtilization: null
      }
    ],
    warning: null
  };
}
