import { ipcRenderer } from "electron";
import type { AccountSummary } from "../shared/types/accounts.js";
import { ipcChannelNames, type PreloadInvokeKey, type PreloadInvokeMap } from "../shared/types/ipc.js";
import type { AppSettings } from "../shared/types/settings.js";
import type { UsageState } from "../shared/types/usage.js";

export interface ClaudeUsageApi {
  readonly version: string;
  getUsageState: () => Promise<UsageState>;
  getSettings: () => Promise<AppSettings>;
  getAccounts: () => Promise<readonly AccountSummary[]>;
}

const preloadInvokeChannels = {
  getUsageState: ipcChannelNames.getUsageState,
  getSettings: ipcChannelNames.getSettings,
  getAccounts: ipcChannelNames.getAccounts
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
    getSettings: () => invoke("getSettings"),
    getAccounts: () => invoke("getAccounts")
  };
}
