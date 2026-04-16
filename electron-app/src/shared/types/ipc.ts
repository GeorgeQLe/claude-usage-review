import type { AccountId } from "./accounts.js";
import type { AccountSummary } from "./accounts.js";
import type { ProviderConfidence } from "./provider.js";
import type { ProviderId } from "./provider.js";
import type { AppSettings, AppSettingsPatch } from "./settings.js";
import type { UsageState } from "./usage.js";

export const ipcChannelNames = {
  getUsageState: "usage:get-state",
  refreshNow: "usage:refresh-now",
  usageUpdated: "usage:updated",
  getSettings: "settings:get",
  updateSettings: "settings:update",
  getAccounts: "accounts:list",
  addAccount: "accounts:add",
  renameAccount: "accounts:rename",
  removeAccount: "accounts:remove",
  setActiveAccount: "accounts:set-active",
  saveClaudeCredentials: "accounts:save-claude-credentials",
  testClaudeConnection: "accounts:test-claude-connection",
  getProviderDiagnostics: "providers:get-diagnostics",
  runProviderDetection: "providers:run-detection",
  generateWrapper: "wrappers:generate",
  verifyWrapper: "wrappers:verify",
  exportDiagnostics: "diagnostics:export"
} as const;

export type IpcChannelKey = keyof typeof ipcChannelNames;

export type IpcChannelName = (typeof ipcChannelNames)[IpcChannelKey];

export interface PreloadInvokeMap {
  readonly getUsageState: {
    readonly channel: typeof ipcChannelNames.getUsageState;
    readonly args: readonly [];
    readonly result: UsageState;
  };
  readonly refreshNow: {
    readonly channel: typeof ipcChannelNames.refreshNow;
    readonly args: readonly [];
    readonly result: UsageState;
  };
  readonly getSettings: {
    readonly channel: typeof ipcChannelNames.getSettings;
    readonly args: readonly [];
    readonly result: AppSettings;
  };
  readonly updateSettings: {
    readonly channel: typeof ipcChannelNames.updateSettings;
    readonly args: readonly [payload: UpdateSettingsPayload];
    readonly result: AppSettings;
  };
  readonly getAccounts: {
    readonly channel: typeof ipcChannelNames.getAccounts;
    readonly args: readonly [];
    readonly result: readonly AccountSummary[];
  };
  readonly addAccount: {
    readonly channel: typeof ipcChannelNames.addAccount;
    readonly args: readonly [payload: AddAccountPayload];
    readonly result: readonly AccountSummary[];
  };
  readonly renameAccount: {
    readonly channel: typeof ipcChannelNames.renameAccount;
    readonly args: readonly [payload: RenameAccountPayload];
    readonly result: readonly AccountSummary[];
  };
  readonly removeAccount: {
    readonly channel: typeof ipcChannelNames.removeAccount;
    readonly args: readonly [payload: AccountIdPayload];
    readonly result: readonly AccountSummary[];
  };
  readonly setActiveAccount: {
    readonly channel: typeof ipcChannelNames.setActiveAccount;
    readonly args: readonly [payload: AccountIdPayload];
    readonly result: readonly AccountSummary[];
  };
  readonly saveClaudeCredentials: {
    readonly channel: typeof ipcChannelNames.saveClaudeCredentials;
    readonly args: readonly [payload: SaveClaudeCredentialsPayload];
    readonly result: readonly AccountSummary[];
  };
  readonly testClaudeConnection: {
    readonly channel: typeof ipcChannelNames.testClaudeConnection;
    readonly args: readonly [payload: TestClaudeConnectionPayload];
    readonly result: ClaudeConnectionTestResult;
  };
  readonly getProviderDiagnostics: {
    readonly channel: typeof ipcChannelNames.getProviderDiagnostics;
    readonly args: readonly [payload: ProviderCommandPayload];
    readonly result: ProviderDiagnosticsResult;
  };
  readonly runProviderDetection: {
    readonly channel: typeof ipcChannelNames.runProviderDetection;
    readonly args: readonly [payload: ProviderCommandPayload];
    readonly result: ProviderDetectionResult;
  };
  readonly generateWrapper: {
    readonly channel: typeof ipcChannelNames.generateWrapper;
    readonly args: readonly [payload: ProviderCommandPayload];
    readonly result: WrapperSetupResult;
  };
  readonly verifyWrapper: {
    readonly channel: typeof ipcChannelNames.verifyWrapper;
    readonly args: readonly [payload: ProviderCommandPayload];
    readonly result: WrapperVerificationResult;
  };
  readonly exportDiagnostics: {
    readonly channel: typeof ipcChannelNames.exportDiagnostics;
    readonly args: readonly [];
    readonly result: DiagnosticsExportResult;
  };
}

export type PreloadInvokeKey = keyof PreloadInvokeMap;

export interface AddAccountPayload {
  readonly label: string;
}

export interface AccountIdPayload {
  readonly accountId: AccountId;
}

export interface RenameAccountPayload {
  readonly accountId: AccountId;
  readonly label: string;
}

export interface SaveClaudeCredentialsPayload {
  readonly accountId: AccountId;
  readonly sessionKey: string;
  readonly orgId: string;
}

export interface TestClaudeConnectionPayload {
  readonly sessionKey: string;
  readonly orgId: string;
}

export interface UpdateSettingsPayload {
  readonly patch: AppSettingsPatch;
}

export interface ProviderCommandPayload {
  readonly providerId: ProviderId;
}

export interface ClaudeConnectionTestResult {
  readonly ok: boolean;
  readonly status: "not_implemented" | "connected" | "auth_expired" | "network_error" | "invalid";
  readonly message: string;
}

export interface ProviderDiagnosticsResult {
  readonly providerId: ProviderId;
  readonly status: "not_configured" | "ready" | "degraded";
  readonly messages: readonly string[];
  readonly lastCheckedAt: string | null;
}

export interface ProviderDetectionResult {
  readonly providerId: ProviderId;
  readonly detected: boolean;
  readonly confidence: ProviderConfidence;
  readonly message: string;
}

export interface WrapperSetupResult {
  readonly providerId: ProviderId;
  readonly command: string | null;
  readonly instructions: readonly string[];
  readonly verified: boolean;
}

export interface WrapperVerificationResult {
  readonly providerId: ProviderId;
  readonly verified: boolean;
  readonly message: string;
}

export interface DiagnosticsExportResult {
  readonly generatedAt: string;
  readonly summary: string;
  readonly entries: readonly string[];
}
