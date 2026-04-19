import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { claudeUsageDataSchema, type ClaudeUsageData } from "../../shared/schemas/claudeUsage.js";
import type { AppSettingsPatch, OverlayLayout } from "../../shared/types/settings.js";
import type {
  MigrationAccountPlan,
  MigrationHistorySnapshotPlan,
  MigrationImportPlan,
  MigrationSourceCandidate,
  SkippedSecretCategory
} from "./types.js";

type JsonRecord = Record<string, unknown>;
type MutableAppSettingsPatch = {
  -readonly [Key in keyof AppSettingsPatch]: AppSettingsPatch[Key];
};

interface LegacyAccountRecord {
  readonly id?: unknown;
  readonly email?: unknown;
  readonly name?: unknown;
  readonly label?: unknown;
  readonly orgId?: unknown;
  readonly org_id?: unknown;
}

export function parseMigrationSource(candidate: MigrationSourceCandidate): MigrationImportPlan {
  switch (candidate.kind) {
    case "swift":
      return parseSwiftMigrationSource(candidate);
    case "tauri":
      return parseTauriMigrationSource(candidate);
  }
}

export function parseSwiftMigrationSource(candidate: MigrationSourceCandidate): MigrationImportPlan {
  const warnings: string[] = [];
  const defaults = candidate.userDefaultsPath ? readLegacyObject(candidate.userDefaultsPath, warnings) : {};
  const skippedSecretCategories = scanSecretCategories(defaults);
  const accounts = parseSwiftAccounts(defaults);
  const accountIdBySourceId = new Map(accounts.map((account) => [account.sourceAccountId, account.accountId]));
  const historySnapshots = candidate.historyPath
    ? parseSwiftHistoryDirectory(candidate.historyPath, accountIdBySourceId, warnings)
    : [];

  return {
    sourceKind: "swift",
    sourcePath: candidate.sourcePath,
    accounts,
    appSettings: parseSwiftSettings(defaults),
    historySnapshots,
    skippedSecretCategories,
    warnings
  };
}

export function parseTauriMigrationSource(candidate: MigrationSourceCandidate): MigrationImportPlan {
  const warnings: string[] = [];
  const config = candidate.configPath ? readLegacyObject(candidate.configPath, warnings) : {};
  const skippedSecretCategories = scanSecretCategories(config);

  return {
    sourceKind: "tauri",
    sourcePath: candidate.sourcePath,
    accounts: parseTauriAccounts(config),
    appSettings: parseTauriSettings(config),
    historySnapshots: [],
    skippedSecretCategories,
    warnings
  };
}

function readLegacyObject(path: string, warnings: string[]): JsonRecord {
  try {
    const text = readFileSync(path, "utf8");
    if (path.endsWith(".plist")) {
      return parseSimplePlist(text);
    }
    const parsed = JSON.parse(text);
    return isRecord(parsed) ? parsed : {};
  } catch (error) {
    warnings.push(`Could not read migration source ${basename(path)}: ${errorMessage(error)}`);
    return {};
  }
}

function parseSwiftAccounts(defaults: JsonRecord): readonly MigrationAccountPlan[] {
  const encodedAccounts = defaults.claude_accounts_metadata ?? defaults.accounts;
  const accountRecords = decodeLegacyArray(encodedAccounts);
  const activeSourceAccountId = stringValue(defaults.claude_active_account_id);

  if (accountRecords.length === 0) {
    const legacyOrgId = stringValue(defaults.claude_org_id);
    if (!legacyOrgId) {
      return [];
    }

    return [
      {
        sourceAccountId: "legacy",
        accountId: "swift-legacy",
        label: "Account 1",
        orgId: legacyOrgId,
        isActive: true
      }
    ];
  }

  return accountRecords.map((account, index) => {
    const sourceAccountId = stringValue(account.id) ?? `account-${index + 1}`;
    const orgId = stringValue(account.orgId) ?? stringValue(account.org_id) ?? stringValue(defaults[`claude_org_id_${sourceAccountId}`]);

    return {
      sourceAccountId,
      accountId: normalizeImportedAccountId("swift", sourceAccountId),
      label: stringValue(account.email) ?? stringValue(account.name) ?? stringValue(account.label) ?? `Account ${index + 1}`,
      orgId: orgId ?? null,
      isActive: activeSourceAccountId ? sourceAccountId === activeSourceAccountId : index === 0
    };
  });
}

function parseTauriAccounts(config: JsonRecord): readonly MigrationAccountPlan[] {
  const accountRecords = decodeLegacyArray(config.accounts);
  const activeSourceAccountId = stringValue(config.active_account_id);

  return accountRecords.map((account, index) => {
    const sourceAccountId = stringValue(account.id) ?? `account-${index + 1}`;

    return {
      sourceAccountId,
      accountId: normalizeImportedAccountId("tauri", sourceAccountId),
      label: stringValue(account.name) ?? stringValue(account.email) ?? stringValue(account.label) ?? `Account ${index + 1}`,
      orgId: stringValue(account.org_id) ?? stringValue(account.orgId) ?? null,
      isActive: activeSourceAccountId ? sourceAccountId === activeSourceAccountId : index === 0
    };
  });
}

function parseSwiftSettings(defaults: JsonRecord): AppSettingsPatch {
  const patch: MutableAppSettingsPatch = {
    providers: parseProviderSettings(defaults)
  };
  const timeDisplay = mapTimeDisplay(stringValue(defaults.claude_time_display_format));
  const weeklyColorMode = mapWeeklyColorMode(stringValue(defaults.claude_weekly_color_mode));
  const paceTheme = mapPaceTheme(stringValue(defaults.claude_pace_theme));

  if (timeDisplay) {
    patch.timeDisplay = timeDisplay;
  }

  if (weeklyColorMode) {
    patch.weeklyColorMode = weeklyColorMode;
  }

  if (paceTheme) {
    patch.paceTheme = paceTheme;
  }

  return removeEmptySettingsPatch(patch);
}

function parseTauriSettings(config: JsonRecord): AppSettingsPatch {
  const patch: MutableAppSettingsPatch = {};
  const timeDisplay = mapTimeDisplay(stringValue(config.time_display_format));
  const overlayLayout = mapOverlayLayout(stringValue(config.overlay_layout));
  const overlayOpacity = numberValue(config.overlay_opacity);
  const overlayEnabled = booleanValue(config.overlay_enabled);
  const overlayPosition = isRecord(config.overlay_position) ? config.overlay_position : null;

  if (timeDisplay) {
    patch.timeDisplay = timeDisplay;
  }

  if (overlayLayout || overlayOpacity !== null || overlayEnabled !== null || overlayPosition) {
    patch.overlay = {
      ...(overlayLayout ? { layout: overlayLayout } : {}),
      ...(overlayOpacity !== null ? { opacity: clamp(overlayOpacity, 0.2, 1) } : {}),
      ...(overlayEnabled !== null ? { enabled: overlayEnabled, visible: overlayEnabled } : {}),
      ...(overlayPosition
        ? {
            bounds: {
              x: Math.trunc(numberValue(overlayPosition.x) ?? 0),
              y: Math.trunc(numberValue(overlayPosition.y) ?? 0),
              width: 320,
              height: 160
            }
          }
        : {})
    };
  }

  return patch;
}

function parseProviderSettings(defaults: JsonRecord): NonNullable<AppSettingsPatch["providers"]> {
  const providers: {
    codex?: NonNullable<NonNullable<AppSettingsPatch["providers"]>["codex"]>;
    gemini?: NonNullable<NonNullable<AppSettingsPatch["providers"]>["gemini"]>;
  } = {};
  const codexEnabled = booleanValue(defaults.provider_codex_enabled);
  const codexAccuracyModeEnabled = booleanValue(defaults.provider_codex_accuracy_mode);
  const codexProfileLabel = stringValue(defaults.provider_codex_plan);
  const geminiEnabled = booleanValue(defaults.provider_gemini_enabled);
  const geminiAccuracyModeEnabled = booleanValue(defaults.provider_gemini_accuracy_mode);
  const geminiProfileLabel = stringValue(defaults.provider_gemini_plan);
  const geminiAuthMode = mapProviderAuthMode(stringValue(defaults.provider_gemini_auth_mode));

  if (codexEnabled !== null || codexAccuracyModeEnabled !== null || codexProfileLabel) {
    providers.codex = {
      ...(codexEnabled !== null ? { enabled: codexEnabled } : {}),
      ...(codexAccuracyModeEnabled !== null
        ? {
            accuracyModeEnabled: codexAccuracyModeEnabled,
            adapterMode: codexAccuracyModeEnabled ? "accuracy" : "passive"
          }
        : {}),
      ...(codexProfileLabel ? { profileLabel: codexProfileLabel, plan: mapPlan(codexProfileLabel) } : {})
    };
  }

  if (geminiEnabled !== null || geminiAccuracyModeEnabled !== null || geminiProfileLabel || geminiAuthMode) {
    providers.gemini = {
      ...(geminiEnabled !== null ? { enabled: geminiEnabled } : {}),
      ...(geminiAccuracyModeEnabled !== null
        ? {
            accuracyModeEnabled: geminiAccuracyModeEnabled,
            adapterMode: geminiAccuracyModeEnabled ? "accuracy" : "passive"
          }
        : {}),
      ...(geminiProfileLabel ? { profileLabel: geminiProfileLabel, plan: mapPlan(geminiProfileLabel) } : {}),
      ...(geminiAuthMode ? { authMode: geminiAuthMode } : {})
    };
  }

  return providers;
}

function parseSwiftHistoryDirectory(
  historyPath: string,
  accountIdBySourceId: ReadonlyMap<string, string>,
  warnings: string[]
): readonly MigrationHistorySnapshotPlan[] {
  let entries: readonly string[] = [];

  try {
    if (!statSync(historyPath).isDirectory()) {
      return [];
    }
    entries = readdirSync(historyPath);
  } catch {
    return [];
  }

  return entries.flatMap((entry) => {
    const match = /^history-(.+)\.json$/u.exec(entry);
    if (!match) {
      return [];
    }

    const sourceAccountId = match[1] ?? "";
    const accountId = accountIdBySourceId.get(sourceAccountId) ?? normalizeImportedAccountId("swift", sourceAccountId);
    const fullPath = join(historyPath, entry);
    const historyRows = decodeLegacyRecordArray(readLegacyObjectOrArray(fullPath, warnings));

    return historyRows.flatMap((row) => {
      const capturedAt = isoDateValue(row.timestamp);
      const sessionUtilization = numberValue(row.sessionUtilization);
      const weeklyUtilization = numberValue(row.weeklyUtilization);

      if (!capturedAt || sessionUtilization === null || weeklyUtilization === null) {
        return [];
      }

      return [
        {
          accountId,
          providerId: "claude" as const,
          capturedAt,
          usage: createCompatibleClaudeUsageData(sessionUtilization, weeklyUtilization)
        }
      ];
    });
  });
}

function readLegacyObjectOrArray(path: string, warnings: string[]): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    warnings.push(`Could not read migration history ${basename(path)}: ${errorMessage(error)}`);
    return [];
  }
}

function createCompatibleClaudeUsageData(sessionUtilization: number, weeklyUtilization: number): ClaudeUsageData {
  return claudeUsageDataSchema.parse({
    fiveHour: {
      utilization: sessionUtilization,
      resetsAt: null
    },
    sevenDay: {
      utilization: weeklyUtilization,
      resetsAt: null
    },
    sevenDaySonnet: null,
    sevenDayOpus: null,
    sevenDayOauthApps: null,
    sevenDayCowork: null,
    other: null,
    extraUsage: null
  });
}

function scanSecretCategories(value: unknown): readonly SkippedSecretCategory[] {
  const categories = new Set<SkippedSecretCategory>();
  scanSecretCategoriesRecursive(value, "", categories);
  return [...categories].sort();
}

function scanSecretCategoriesRecursive(value: unknown, keyPath: string, categories: Set<SkippedSecretCategory>): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanSecretCategoriesRecursive(item, `${keyPath}.${index}`, categories));
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const nestedPath = keyPath ? `${keyPath}.${key}` : key;
    const normalizedKey = key.toLowerCase();

    if (/session[_-]?key/u.test(normalizedKey)) {
      categories.add("claude-session-key");
    }
    if (/github.*token|gh[_-]?token/u.test(normalizedKey)) {
      categories.add("github-token");
    }
    if (/access[_-]?token|refresh[_-]?token|id[_-]?token|oauth|auth\.json|oauth[_-]?creds/u.test(normalizedKey)) {
      categories.add("provider-auth-token");
    }
    if (/api[_-]?key/u.test(normalizedKey)) {
      categories.add("api-key");
    }
    if (/cookie/u.test(normalizedKey)) {
      categories.add("cookie");
    }
    if (/session|chat|message/u.test(normalizedKey)) {
      categories.add("raw-provider-session");
    }
    if (/prompt/u.test(normalizedKey)) {
      categories.add("raw-provider-prompt");
    }
    if (/stdout|stderr|response|completion|output/u.test(normalizedKey)) {
      categories.add("raw-provider-output");
    }

    scanSecretCategoriesRecursive(nestedValue, nestedPath, categories);
  }
}

function decodeLegacyArray(value: unknown): readonly LegacyAccountRecord[] {
  return decodeLegacyRecordArray(value) as readonly LegacyAccountRecord[];
}

function decodeLegacyRecordArray(value: unknown): readonly JsonRecord[] {
  const decoded = decodeEncodedJson(value);
  if (Array.isArray(decoded)) {
    return decoded.filter(isRecord);
  }
  return [];
}

function decodeEncodedJson(value: unknown): unknown {
  if (Array.isArray(value) || isRecord(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return value;
  }

  for (const candidate of [trimmed, decodeBase64(trimmed)]) {
    if (!candidate) {
      continue;
    }
    try {
      return JSON.parse(candidate);
    } catch {
      continue;
    }
  }

  return value;
}

function parseSimplePlist(text: string): JsonRecord {
  const result: JsonRecord = {};
  const itemPattern =
    /<key>([^<]+)<\/key>\s*(?:<string>([^<]*)<\/string>|<integer>([^<]*)<\/integer>|<real>([^<]*)<\/real>|<(true|false)\s*\/>|<data>([\s\S]*?)<\/data>)/gu;

  for (const match of text.matchAll(itemPattern)) {
    const key = unescapeXml(match[1] ?? "");
    const stringMatch = match[2];
    const integerMatch = match[3];
    const realMatch = match[4];
    const booleanMatch = match[5];
    const dataMatch = match[6];

    if (stringMatch !== undefined) {
      result[key] = unescapeXml(stringMatch);
    } else if (integerMatch !== undefined) {
      result[key] = Number.parseInt(integerMatch, 10);
    } else if (realMatch !== undefined) {
      result[key] = Number.parseFloat(realMatch);
    } else if (booleanMatch !== undefined) {
      result[key] = booleanMatch === "true";
    } else if (dataMatch !== undefined) {
      result[key] = decodeBase64(dataMatch.replace(/\s+/gu, "")) ?? "";
    }
  }

  return result;
}

function removeEmptySettingsPatch(patch: AppSettingsPatch): AppSettingsPatch {
  const providers = patch.providers;
  const hasProviders = providers && (providers.codex || providers.gemini);

  return {
    ...patch,
    ...(hasProviders ? { providers } : { providers: undefined })
  };
}

function normalizeImportedAccountId(source: "swift" | "tauri", id: string): string {
  const normalized = id.trim().toLowerCase().replace(/[^a-z0-9_-]+/gu, "-").replace(/^-+|-+$/gu, "");
  return `${source}-${normalized || "account"}`;
}

function mapTimeDisplay(value: string | null): AppSettingsPatch["timeDisplay"] | null {
  switch (value) {
    case "reset_time":
    case "reset-time":
      return "reset-time";
    case "remaining_time":
    case "countdown":
      return "countdown";
    default:
      return null;
  }
}

function mapWeeklyColorMode(value: string | null): AppSettingsPatch["weeklyColorMode"] | null {
  switch (value) {
    case "pace_aware":
    case "pace-aware":
      return "pace-aware";
    case "raw_percentage":
    case "raw-percentage":
      return "raw-percentage";
    default:
      return null;
  }
}

function mapPaceTheme(value: string | null): AppSettingsPatch["paceTheme"] | null {
  switch (value) {
    case "balanced":
    case "running":
      return "balanced";
    case "strict":
    case "f1_quali":
      return "strict";
    case "relaxed":
    case "racecar":
      return "relaxed";
    default:
      return null;
  }
}

function mapOverlayLayout(value: string | null): OverlayLayout | null {
  switch (value) {
    case "compact":
    case "minimal":
    case "sidebar":
      return value;
    default:
      return null;
  }
}

function mapProviderAuthMode(value: string | null): "oauth-personal" | "api-key" | "none" | "unknown" | null {
  switch (value) {
    case "oauthPersonal":
    case "oauth-personal":
    case "codeAssist":
      return "oauth-personal";
    case "apiKey":
    case "api-key":
      return "api-key";
    case "none":
      return "none";
    case "unknown":
      return "unknown";
    default:
      return null;
  }
}

function mapPlan(value: string): "free" | "pro" | "team" | "enterprise" | "unknown" {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("free")) {
    return "free";
  }
  if (normalized.includes("pro") || normalized.includes("plus")) {
    return "pro";
  }
  if (normalized.includes("team") || normalized.includes("business")) {
    return "team";
  }
  if (normalized.includes("enterprise")) {
    return "enterprise";
  }
  return "unknown";
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function booleanValue(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    if (value === "true") {
      return true;
    }
    if (value === "false") {
      return false;
    }
  }
  return null;
}

function isoDateValue(value: unknown): string | null {
  const raw = typeof value === "number" ? value * 1000 : typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(raw)) {
    return null;
  }
  return new Date(raw).toISOString();
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function decodeBase64(value: string): string | null {
  try {
    return Buffer.from(value, "base64").toString("utf8");
  } catch {
    return null;
  }
}

function unescapeXml(value: string): string {
  return value
    .replace(/&quot;/gu, "\"")
    .replace(/&apos;/gu, "'")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&amp;/gu, "&");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
