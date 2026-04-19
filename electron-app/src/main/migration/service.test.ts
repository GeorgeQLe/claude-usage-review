import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { openAppDatabase, type OpenedAppDatabase } from "../storage/database.js";
import { discoverMigrationSources } from "./discovery.js";
import { createMigrationService } from "./service.js";

let opened: OpenedAppDatabase | null = null;
const tempDirs: string[] = [];

describe("legacy app migration service", () => {
  afterEach(() => {
    opened?.close();
    opened = null;

    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("imports Swift non-secret metadata, compatible history snapshots, and skipped secret categories", () => {
    const homeDir = createTempHome();
    const preferencesDir = join(homeDir, "Library", "Preferences");
    const appSupportDir = join(homeDir, "Library", "Application Support", "ClaudeUsage");
    mkdirSync(preferencesDir, { recursive: true });
    mkdirSync(appSupportDir, { recursive: true });

    const accountMetadata = [
      { id: "A1111111-1111-1111-1111-111111111111", email: "Personal", orgId: "org_personal" },
      { id: "B2222222-2222-2222-2222-222222222222", email: "Work", orgId: "org_work" }
    ];
    writeJson(join(preferencesDir, "com.claudeusage.app.json"), {
      claude_accounts_metadata: Buffer.from(JSON.stringify(accountMetadata), "utf8").toString("base64"),
      claude_active_account_id: "B2222222-2222-2222-2222-222222222222",
      claude_time_display_format: "remaining_time",
      claude_weekly_color_mode: "raw_percentage",
      claude_pace_theme: "f1_quali",
      provider_codex_enabled: true,
      provider_codex_accuracy_mode: true,
      provider_codex_plan: "Pro",
      provider_gemini_enabled: true,
      provider_gemini_auth_mode: "codeAssist",
      provider_gemini_plan: "Business",
      sessionKey: "sk-ant-sid01-swift-secret",
      githubToken: `ghp_${"1".repeat(36)}`,
      prompt: "private prompt text"
    });
    writeJson(join(appSupportDir, "history-B2222222-2222-2222-2222-222222222222.json"), [
      {
        timestamp: 1776268800,
        sessionUtilization: 0.4,
        weeklyUtilization: 0.7
      }
    ]);

    opened = openAppDatabase({ inMemory: true });
    const [candidate] = discoverMigrationSources({ homeDir });
    const result = createMigrationService({
      database: opened.database,
      idFactory: createSequentialIdFactory(),
      now: () => "2026-04-19T12:00:00.000Z"
    }).importSource(candidate!);

    expect(result.imported).toEqual({
      accounts: 2,
      appSettings: 1,
      historySnapshots: 1,
      providerSettings: 2
    });
    expect(result.skippedSecretCategories).toEqual(
      expect.arrayContaining(["claude-session-key", "github-token", "raw-provider-prompt"])
    );
    expect(result.record.status).toBe("imported");

    const accounts = opened.database
      .prepare("SELECT id, label, org_id, is_active, auth_status FROM accounts ORDER BY label ASC;")
      .all();
    expect(accounts).toEqual([
      {
        id: "swift-a1111111-1111-1111-1111-111111111111",
        label: "Personal",
        org_id: "org_personal",
        is_active: 0,
        auth_status: "missing_credentials"
      },
      {
        id: "swift-b2222222-2222-2222-2222-222222222222",
        label: "Work",
        org_id: "org_work",
        is_active: 1,
        auth_status: "missing_credentials"
      }
    ]);

    const snapshot = opened.database
      .prepare("SELECT account_id, provider_id, captured_at, session_utilization, weekly_utilization, payload_json FROM usage_snapshots;")
      .get() as {
      readonly account_id: string;
      readonly provider_id: string;
      readonly captured_at: string;
      readonly session_utilization: number;
      readonly weekly_utilization: number;
      readonly payload_json: string;
    };
    expect(snapshot).toMatchObject({
      account_id: "swift-b2222222-2222-2222-2222-222222222222",
      provider_id: "claude",
      captured_at: "2026-04-15T16:00:00.000Z",
      session_utilization: 0.4,
      weekly_utilization: 0.7
    });
    expect(JSON.parse(snapshot.payload_json)).toMatchObject({
      fiveHour: { utilization: 0.4, resetsAt: null },
      sevenDay: { utilization: 0.7, resetsAt: null }
    });

    const appSettings = readStoredJson("app_settings", "value_json", "key = 'app'");
    expect(appSettings).toMatchObject({
      timeDisplay: "countdown",
      weeklyColorMode: "raw-percentage",
      paceTheme: "strict"
    });

    const codexSettings = readProviderSettings("codex");
    expect(codexSettings).toMatchObject({
      enabled: true,
      accuracyModeEnabled: true,
      adapterMode: "accuracy",
      profileLabel: "Pro",
      plan: "pro"
    });

    const serializedDatabaseState = JSON.stringify({
      accounts,
      snapshot,
      appSettings,
      codexSettings,
      record: result.record
    });
    expect(serializedDatabaseState).not.toContain("sk-ant-sid01-swift-secret");
    expect(serializedDatabaseState).not.toContain("private prompt text");
    expect(serializedDatabaseState).not.toContain("ghp_");
  });

  it("imports Tauri config account metadata and overlay settings without credential material", () => {
    const homeDir = createTempHome();
    const configDir = join(homeDir, ".config", "ClaudeUsage");
    mkdirSync(configDir, { recursive: true });
    writeJson(join(configDir, "config.json"), {
      accounts: [
        {
          id: "4fce1014-a414-4978-974d-4ec9f2d2d8b4",
          name: "Linux",
          org_id: "org_linux"
        }
      ],
      active_account_id: "4fce1014-a414-4978-974d-4ec9f2d2d8b4",
      time_display_format: "reset_time",
      overlay_enabled: true,
      overlay_layout: "sidebar",
      overlay_opacity: 0.74,
      overlay_position: { x: 100.5, y: 42.25 },
      session_key: "sk-ant-sid01-tauri-secret"
    });

    opened = openAppDatabase({ inMemory: true });
    const [candidate] = discoverMigrationSources({ homeDir });
    const result = createMigrationService({
      database: opened.database,
      idFactory: createSequentialIdFactory(),
      now: () => "2026-04-19T12:00:00.000Z"
    }).importSource(candidate!);

    expect(result.imported).toEqual({
      accounts: 1,
      appSettings: 1,
      historySnapshots: 0,
      providerSettings: 0
    });
    expect(result.skippedSecretCategories).toContain("claude-session-key");

    expect(
      opened.database.prepare("SELECT id, label, org_id, is_active, auth_status FROM accounts;").get()
    ).toEqual({
      id: "tauri-4fce1014-a414-4978-974d-4ec9f2d2d8b4",
      label: "Linux",
      org_id: "org_linux",
      is_active: 1,
      auth_status: "missing_credentials"
    });

    expect(readStoredJson("app_settings", "value_json", "key = 'app'")).toMatchObject({
      timeDisplay: "reset-time",
      overlay: {
        enabled: true,
        visible: true,
        layout: "sidebar",
        opacity: 0.74,
        bounds: {
          x: 100,
          y: 42,
          width: 320,
          height: 160
        }
      }
    });
    expect(JSON.stringify(result.record)).not.toContain("sk-ant-sid01-tauri-secret");
  });

  it("records every skipped secret category from nested Swift and Tauri metadata without importing values", () => {
    const homeDir = createTempHome();
    const preferencesDir = join(homeDir, "Library", "Preferences");
    const configDir = join(homeDir, ".config", "ClaudeUsage");
    mkdirSync(preferencesDir, { recursive: true });
    mkdirSync(configDir, { recursive: true });

    writeJson(join(preferencesDir, "com.claudeusage.app.json"), {
      claude_org_id: "org_swift",
      nested: {
        sessionKey: "sk-ant-sid01-swift-secret",
        githubToken: `ghp_${"2".repeat(36)}`,
        provider: {
          access_token: "provider-access-secret",
          api_key: "provider-api-secret",
          cookie: "session-cookie-secret",
          chat: "private chat transcript",
          prompt: "private prompt text",
          stderr: "raw stderr with token"
        }
      }
    });
    writeJson(join(configDir, "config.json"), {
      accounts: [{ id: "linux", name: "Linux", org_id: "org_linux" }],
      active_account_id: "linux",
      auth: {
        refresh_token: "provider-refresh-secret",
        response: "raw provider response"
      }
    });

    opened = openAppDatabase({ inMemory: true });
    const migrationService = createMigrationService({
      database: opened.database,
      idFactory: createSequentialIdFactory(),
      now: () => "2026-04-19T12:00:00.000Z"
    });
    const results = discoverMigrationSources({ homeDir }).map((candidate) => migrationService.importSource(candidate));

    const skipped = new Set(results.flatMap((result) => result.skippedSecretCategories));
    expect(skipped).toEqual(
      new Set([
        "api-key",
        "claude-session-key",
        "cookie",
        "github-token",
        "provider-auth-token",
        "raw-provider-output",
        "raw-provider-prompt",
        "raw-provider-session"
      ])
    );

    const serializedState = JSON.stringify({
      results,
      accounts: opened.database.prepare("SELECT id, label, org_id, auth_status FROM accounts ORDER BY id;").all(),
      settings: opened.database.prepare("SELECT value_json FROM app_settings;").all(),
      providerSettings: opened.database.prepare("SELECT settings_json FROM provider_settings;").all()
    });
    expect(serializedState).not.toMatch(
      /sk-ant-sid01-swift-secret|ghp_|provider-access-secret|provider-refresh-secret|provider-api-secret|session-cookie-secret|private chat transcript|private prompt text|raw stderr with token|raw provider response/iu
    );
  });
});

function createTempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), "claude-usage-migration-"));
  tempDirs.push(dir);
  return dir;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2));
}

function createSequentialIdFactory(): () => string {
  let index = 0;
  return () => `migration-test-id-${++index}`;
}

function readStoredJson(table: string, column: string, whereClause: string): unknown {
  const row = opened?.database.prepare(`SELECT ${column} AS value FROM ${table} WHERE ${whereClause};`).get() as
    | { readonly value: string }
    | undefined;
  return JSON.parse(row?.value ?? "{}");
}

function readProviderSettings(providerId: string): unknown {
  const row = opened?.database.prepare("SELECT settings_json FROM provider_settings WHERE provider_id = ?;").get(providerId) as
    | { readonly settings_json: string }
    | undefined;
  return JSON.parse(row?.settings_json ?? "{}");
}
