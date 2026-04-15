import { ipcRenderer, type IpcRendererEvent } from "electron";
import { usageStateSchema } from "../shared/schemas/usage.js";
import type { AccountId } from "../shared/types/accounts.js";
import type { AccountSummary } from "../shared/types/accounts.js";
import type {
  ClaudeConnectionTestResult,
  DiagnosticsExportResult,
  ProviderDetectionResult,
  ProviderDiagnosticsResult,
  WrapperSetupResult,
  WrapperVerificationResult
} from "../shared/types/ipc.js";
import { ipcChannelNames, type PreloadInvokeKey, type PreloadInvokeMap } from "../shared/types/ipc.js";
import type { ProviderId } from "../shared/types/provider.js";
import type { AppSettings } from "../shared/types/settings.js";
import type { UsageState } from "../shared/types/usage.js";

export interface ClaudeUsageApi {
  readonly version: string;
  getUsageState: () => Promise<UsageState>;
  refreshNow: () => Promise<UsageState>;
  subscribeUsageUpdated: (callback: (state: UsageState) => void) => () => void;
  getSettings: () => Promise<AppSettings>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>;
  getAccounts: () => Promise<readonly AccountSummary[]>;
  addAccount: (label: string) => Promise<readonly AccountSummary[]>;
  renameAccount: (accountId: AccountId, label: string) => Promise<readonly AccountSummary[]>;
  removeAccount: (accountId: AccountId) => Promise<readonly AccountSummary[]>;
  setActiveAccount: (accountId: AccountId) => Promise<readonly AccountSummary[]>;
  saveClaudeCredentials: (
    accountId: AccountId,
    sessionKey: string,
    orgId: string
  ) => Promise<readonly AccountSummary[]>;
  testClaudeConnection: (sessionKey: string, orgId: string) => Promise<ClaudeConnectionTestResult>;
  getProviderDiagnostics: (providerId: ProviderId) => Promise<ProviderDiagnosticsResult>;
  runProviderDetection: (providerId: ProviderId) => Promise<ProviderDetectionResult>;
  generateWrapper: (providerId: ProviderId) => Promise<WrapperSetupResult>;
  verifyWrapper: (providerId: ProviderId) => Promise<WrapperVerificationResult>;
  exportDiagnostics: () => Promise<DiagnosticsExportResult>;
}

const preloadInvokeChannels = {
  getUsageState: ipcChannelNames.getUsageState,
  refreshNow: ipcChannelNames.refreshNow,
  getSettings: ipcChannelNames.getSettings,
  updateSettings: ipcChannelNames.updateSettings,
  getAccounts: ipcChannelNames.getAccounts,
  addAccount: ipcChannelNames.addAccount,
  renameAccount: ipcChannelNames.renameAccount,
  removeAccount: ipcChannelNames.removeAccount,
  setActiveAccount: ipcChannelNames.setActiveAccount,
  saveClaudeCredentials: ipcChannelNames.saveClaudeCredentials,
  testClaudeConnection: ipcChannelNames.testClaudeConnection,
  getProviderDiagnostics: ipcChannelNames.getProviderDiagnostics,
  runProviderDetection: ipcChannelNames.runProviderDetection,
  generateWrapper: ipcChannelNames.generateWrapper,
  verifyWrapper: ipcChannelNames.verifyWrapper,
  exportDiagnostics: ipcChannelNames.exportDiagnostics
} as const satisfies {
  readonly [Key in PreloadInvokeKey]: PreloadInvokeMap[Key]["channel"];
};

export function createClaudeUsageApi(): ClaudeUsageApi {
  const invoke = <Key extends PreloadInvokeKey>(
    key: Key,
    ...args: PreloadInvokeMap[Key]["args"]
  ): Promise<PreloadInvokeMap[Key]["result"]> =>
    ipcRenderer.invoke(preloadInvokeChannels[key], ...args) as Promise<PreloadInvokeMap[Key]["result"]>;

  return {
    version: "0.1.0",
    getUsageState: () => invoke("getUsageState"),
    refreshNow: () => invoke("refreshNow"),
    subscribeUsageUpdated: (callback) => {
      const listener = (_event: IpcRendererEvent, payload: unknown) => {
        const result = usageStateSchema.safeParse(payload);
        if (result.success) {
          callback(result.data);
          return;
        }

        console.warn("Ignored invalid usage update payload.");
      };

      ipcRenderer.on(ipcChannelNames.usageUpdated, listener);

      return () => {
        ipcRenderer.removeListener(ipcChannelNames.usageUpdated, listener);
      };
    },
    getSettings: () => invoke("getSettings"),
    updateSettings: (patch) => invoke("updateSettings", { patch }),
    getAccounts: () => invoke("getAccounts"),
    addAccount: (label) => invoke("addAccount", { label }),
    renameAccount: (accountId, label) => invoke("renameAccount", { accountId, label }),
    removeAccount: (accountId) => invoke("removeAccount", { accountId }),
    setActiveAccount: (accountId) => invoke("setActiveAccount", { accountId }),
    saveClaudeCredentials: (accountId, sessionKey, orgId) =>
      invoke("saveClaudeCredentials", { accountId, sessionKey, orgId }),
    testClaudeConnection: (sessionKey, orgId) => invoke("testClaudeConnection", { sessionKey, orgId }),
    getProviderDiagnostics: (providerId) => invoke("getProviderDiagnostics", { providerId }),
    runProviderDetection: (providerId) => invoke("runProviderDetection", { providerId }),
    generateWrapper: (providerId) => invoke("generateWrapper", { providerId }),
    verifyWrapper: (providerId) => invoke("verifyWrapper", { providerId }),
    exportDiagnostics: () => invoke("exportDiagnostics")
  };
}
