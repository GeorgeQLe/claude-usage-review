import { BrowserWindow, ipcMain } from "electron";
import { z } from "zod";
import {
  accountIdPayloadSchema,
  addAccountPayloadSchema,
  claudeConnectionTestResultSchema,
  diagnosticsExportResultSchema,
  providerCommandPayloadSchema,
  providerDetectionResultSchema,
  providerDiagnosticsResultSchema,
  renameAccountPayloadSchema,
  saveClaudeCredentialsPayloadSchema,
  testClaudeConnectionPayloadSchema,
  updateSettingsPayloadSchema,
  wrapperSetupResultSchema,
  wrapperVerificationResultSchema
} from "../shared/schemas/ipc.js";
import { accountSummarySchema } from "../shared/schemas/accounts.js";
import { appSettingsSchema } from "../shared/schemas/settings.js";
import { usageStateSchema } from "../shared/schemas/usage.js";
import type { AccountId, AccountSummary } from "../shared/types/accounts.js";
import type {
  ClaudeConnectionTestResult,
  DiagnosticsExportResult,
  ProviderDetectionResult,
  ProviderDiagnosticsResult,
  WrapperSetupResult,
  WrapperVerificationResult
} from "../shared/types/ipc.js";
import { ipcChannelNames, type IpcChannelName } from "../shared/types/ipc.js";
import type { ProviderId } from "../shared/types/provider.js";
import type { AppSettings, AppSettingsPatch } from "../shared/types/settings.js";
import type { UsageState } from "../shared/types/usage.js";
import { getSecretStorageStatus } from "./storage/secrets.js";

export { ipcChannelNames };
export type { IpcChannelName };

export interface IpcRegistration {
  dispose: () => void;
}

const accountSummariesSchema = z.array(accountSummarySchema);

const registeredInvokeChannels = [
  ipcChannelNames.getUsageState,
  ipcChannelNames.refreshNow,
  ipcChannelNames.getSettings,
  ipcChannelNames.updateSettings,
  ipcChannelNames.getAccounts,
  ipcChannelNames.addAccount,
  ipcChannelNames.renameAccount,
  ipcChannelNames.removeAccount,
  ipcChannelNames.setActiveAccount,
  ipcChannelNames.saveClaudeCredentials,
  ipcChannelNames.testClaudeConnection,
  ipcChannelNames.getProviderDiagnostics,
  ipcChannelNames.runProviderDetection,
  ipcChannelNames.generateWrapper,
  ipcChannelNames.verifyWrapper,
  ipcChannelNames.exportDiagnostics
] as const satisfies readonly IpcChannelName[];

export function registerIpcHandlers(): IpcRegistration {
  const state = createPlaceholderIpcState();

  for (const channel of registeredInvokeChannels) {
    ipcMain.removeHandler(channel);
  }

  ipcMain.handle(ipcChannelNames.getUsageState, () => state.getUsageState());
  ipcMain.handle(ipcChannelNames.refreshNow, () => {
    const usageState = state.refreshNow();
    broadcastUsageUpdated(usageState);
    return usageState;
  });
  ipcMain.handle(ipcChannelNames.getSettings, () => state.getSettings());
  ipcMain.handle(ipcChannelNames.updateSettings, (_event, payload: unknown) =>
    state.updateSettings(parsePayload(updateSettingsPayloadSchema, payload))
  );
  ipcMain.handle(ipcChannelNames.getAccounts, () => state.getAccounts());
  ipcMain.handle(ipcChannelNames.addAccount, (_event, payload: unknown) =>
    state.addAccount(parsePayload(addAccountPayloadSchema, payload).label)
  );
  ipcMain.handle(ipcChannelNames.renameAccount, (_event, payload: unknown) =>
    state.renameAccount(parsePayload(renameAccountPayloadSchema, payload))
  );
  ipcMain.handle(ipcChannelNames.removeAccount, (_event, payload: unknown) =>
    state.removeAccount(parsePayload(accountIdPayloadSchema, payload).accountId)
  );
  ipcMain.handle(ipcChannelNames.setActiveAccount, (_event, payload: unknown) =>
    state.setActiveAccount(parsePayload(accountIdPayloadSchema, payload).accountId)
  );
  ipcMain.handle(ipcChannelNames.saveClaudeCredentials, (_event, payload: unknown) =>
    state.saveClaudeCredentials(parsePayload(saveClaudeCredentialsPayloadSchema, payload))
  );
  ipcMain.handle(ipcChannelNames.testClaudeConnection, (_event, payload: unknown) => {
    parsePayload(testClaudeConnectionPayloadSchema, payload);
    return validateClaudeConnectionResult({
      ok: false,
      status: "not_implemented",
      message: "Claude connection testing is not connected in the foundation IPC skeleton."
    });
  });
  ipcMain.handle(ipcChannelNames.getProviderDiagnostics, (_event, payload: unknown) =>
    state.getProviderDiagnostics(parsePayload(providerCommandPayloadSchema, payload).providerId)
  );
  ipcMain.handle(ipcChannelNames.runProviderDetection, (_event, payload: unknown) =>
    state.runProviderDetection(parsePayload(providerCommandPayloadSchema, payload).providerId)
  );
  ipcMain.handle(ipcChannelNames.generateWrapper, (_event, payload: unknown) =>
    state.generateWrapper(parsePayload(providerCommandPayloadSchema, payload).providerId)
  );
  ipcMain.handle(ipcChannelNames.verifyWrapper, (_event, payload: unknown) =>
    state.verifyWrapper(parsePayload(providerCommandPayloadSchema, payload).providerId)
  );
  ipcMain.handle(ipcChannelNames.exportDiagnostics, () => state.exportDiagnostics());

  return {
    dispose: () => {
      for (const channel of registeredInvokeChannels) {
        ipcMain.removeHandler(channel);
      }
    }
  };
}

function createPlaceholderIpcState() {
  let nextAccountNumber = 2;
  let settings = validateSettings({
    launchAtLogin: false,
    timeDisplay: "countdown",
    paceTheme: "balanced",
    weeklyColorMode: "pace-aware",
    overlay: {
      enabled: false,
      layout: "compact",
      opacity: 0.9
    }
  });
  let accounts = validateAccounts([
    {
      id: "local-placeholder",
      label: "Local placeholder",
      orgId: null,
      isActive: true,
      authStatus: "missing_credentials"
    }
  ]);
  let usageState = validateUsageState({
    activeProviderId: "claude",
    providers: [
      createPlaceholderProviderCard("claude", "Claude"),
      createPlaceholderProviderCard("codex", "Codex"),
      createPlaceholderProviderCard("gemini", "Gemini")
    ],
    lastUpdatedAt: null,
    warning: deriveStorageWarning()
  });

  return {
    getUsageState: (): UsageState => usageState,
    refreshNow: (): UsageState => {
      const refreshedAt = new Date().toISOString();
      usageState = validateUsageState({
        ...usageState,
        providers: usageState.providers.map((provider) => ({
          ...provider,
          lastUpdatedAt: refreshedAt
        })),
        lastUpdatedAt: refreshedAt
      });
      return usageState;
    },
    getSettings: (): AppSettings => settings,
    updateSettings: (payload: { readonly patch: AppSettingsPatch }): AppSettings => {
      settings = validateSettings({
        ...settings,
        ...payload.patch,
        overlay: payload.patch.overlay ? { ...settings.overlay, ...payload.patch.overlay } : settings.overlay
      });
      return settings;
    },
    getAccounts: (): readonly AccountSummary[] => accounts,
    addAccount: (label: string): readonly AccountSummary[] => {
      const account: AccountSummary = {
        id: `account-${nextAccountNumber}`,
        label,
        orgId: null,
        isActive: accounts.length === 0,
        authStatus: "missing_credentials"
      };
      nextAccountNumber += 1;
      accounts = validateAccounts(normalizeActiveAccount([...accounts, account]));
      return accounts;
    },
    renameAccount: (payload: { readonly accountId: AccountId; readonly label: string }): readonly AccountSummary[] => {
      assertKnownAccount(accounts, payload.accountId);
      accounts = validateAccounts(
        accounts.map((account) =>
          account.id === payload.accountId ? { ...account, label: payload.label } : account
        )
      );
      return accounts;
    },
    removeAccount: (accountId: AccountId): readonly AccountSummary[] => {
      assertKnownAccount(accounts, accountId);
      accounts = validateAccounts(normalizeActiveAccount(accounts.filter((account) => account.id !== accountId)));
      return accounts;
    },
    setActiveAccount: (accountId: AccountId): readonly AccountSummary[] => {
      assertKnownAccount(accounts, accountId);
      accounts = validateAccounts(
        accounts.map((account) => ({
          ...account,
          isActive: account.id === accountId
        }))
      );
      return accounts;
    },
    saveClaudeCredentials: (payload: {
      readonly accountId: AccountId;
      readonly orgId: string;
    }): readonly AccountSummary[] => {
      assertKnownAccount(accounts, payload.accountId);
      accounts = validateAccounts(
        accounts.map((account) =>
          account.id === payload.accountId
            ? {
                ...account,
                orgId: payload.orgId,
                authStatus: "configured"
              }
            : account
        )
      );
      return accounts;
    },
    getProviderDiagnostics: (providerId: ProviderId): ProviderDiagnosticsResult =>
      validateProviderDiagnosticsResult({
        providerId,
        status: "not_configured",
        messages: ["Provider diagnostics are not connected in the foundation IPC skeleton."],
        lastCheckedAt: null
      }),
    runProviderDetection: (providerId: ProviderId): ProviderDetectionResult =>
      validateProviderDetectionResult({
        providerId,
        detected: false,
        confidence: "observed_only",
        message: "Provider detection is not connected in the foundation IPC skeleton."
      }),
    generateWrapper: (providerId: ProviderId): WrapperSetupResult =>
      validateWrapperSetupResult({
        providerId,
        command: null,
        instructions: ["Wrapper generation is not connected in the foundation IPC skeleton."],
        verified: false
      }),
    verifyWrapper: (providerId: ProviderId): WrapperVerificationResult =>
      validateWrapperVerificationResult({
        providerId,
        verified: false,
        message: "Wrapper verification is not connected in the foundation IPC skeleton."
      }),
    exportDiagnostics: (): DiagnosticsExportResult =>
      validateDiagnosticsExportResult({
        generatedAt: new Date().toISOString(),
        summary: "Diagnostics export is not connected in the foundation IPC skeleton.",
        entries: []
      })
  };
}

function deriveStorageWarning(): string | null {
  return getSecretStorageStatus().warning;
}

function createPlaceholderProviderCard(providerId: ProviderId, displayName: string): UsageState["providers"][number] {
  return {
    providerId,
    displayName,
    enabled: providerId === "claude",
    status: "missing_configuration",
    confidence: "observed_only",
    headline: `${displayName} not configured`,
    detailText: "Connect storage and provider services in a later phase.",
    sessionUtilization: null,
    weeklyUtilization: null,
    dailyRequestCount: null,
    requestsPerMinute: null,
    resetAt: null,
    lastUpdatedAt: null,
    adapterMode: "passive",
    confidenceExplanation: "Foundation placeholder state only.",
    actions: []
  };
}

function parsePayload<T>(schema: z.ZodType<T>, payload: unknown): T {
  return schema.parse(payload);
}

function validateUsageState(value: unknown): UsageState {
  return usageStateSchema.parse(value);
}

function validateSettings(value: unknown): AppSettings {
  return appSettingsSchema.parse(value);
}

function validateAccounts(value: unknown): readonly AccountSummary[] {
  return accountSummariesSchema.parse(value);
}

function validateClaudeConnectionResult(value: unknown): ClaudeConnectionTestResult {
  return claudeConnectionTestResultSchema.parse(value);
}

function validateProviderDiagnosticsResult(value: unknown): ProviderDiagnosticsResult {
  return providerDiagnosticsResultSchema.parse(value);
}

function validateProviderDetectionResult(value: unknown): ProviderDetectionResult {
  return providerDetectionResultSchema.parse(value);
}

function validateWrapperSetupResult(value: unknown): WrapperSetupResult {
  return wrapperSetupResultSchema.parse(value);
}

function validateWrapperVerificationResult(value: unknown): WrapperVerificationResult {
  return wrapperVerificationResultSchema.parse(value);
}

function validateDiagnosticsExportResult(value: unknown): DiagnosticsExportResult {
  return diagnosticsExportResultSchema.parse(value);
}

function normalizeActiveAccount(accounts: readonly AccountSummary[]): readonly AccountSummary[] {
  if (accounts.length === 0) {
    return [];
  }

  const activeIndex = accounts.findIndex((account) => account.isActive);
  const normalizedActiveIndex = activeIndex === -1 ? 0 : activeIndex;

  return accounts.map((account, index) => ({
    ...account,
    isActive: index === normalizedActiveIndex
  }));
}

function assertKnownAccount(accounts: readonly AccountSummary[], accountId: AccountId): void {
  if (!accounts.some((account) => account.id === accountId)) {
    throw new Error(`Unknown account: ${accountId}`);
  }
}

function broadcastUsageUpdated(usageState: UsageState): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(ipcChannelNames.usageUpdated, usageState);
  }
}
