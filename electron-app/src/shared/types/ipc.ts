import type { AccountId } from "./accounts.js";
import type { AccountSummary } from "./accounts.js";
import type { AppSettings } from "./settings.js";
import type { UsageState } from "./usage.js";

export const ipcChannelNames = {
  getUsageState: "usage:get-state",
  refreshNow: "usage:refresh-now",
  getSettings: "settings:get",
  updateSettings: "settings:update",
  getAccounts: "accounts:list",
  addAccount: "accounts:add",
  renameAccount: "accounts:rename",
  removeAccount: "accounts:remove",
  setActiveAccount: "accounts:set-active"
} as const;

export type IpcChannelKey = keyof typeof ipcChannelNames;

export type IpcChannelName = (typeof ipcChannelNames)[IpcChannelKey];

export interface PreloadInvokeMap {
  readonly getUsageState: {
    readonly channel: typeof ipcChannelNames.getUsageState;
    readonly args: readonly [];
    readonly result: UsageState;
  };
  readonly getSettings: {
    readonly channel: typeof ipcChannelNames.getSettings;
    readonly args: readonly [];
    readonly result: AppSettings;
  };
  readonly getAccounts: {
    readonly channel: typeof ipcChannelNames.getAccounts;
    readonly args: readonly [];
    readonly result: readonly AccountSummary[];
  };
}

export type PreloadInvokeKey = keyof PreloadInvokeMap;

export interface RenameAccountPayload {
  readonly accountId: AccountId;
  readonly label: string;
}

export interface SaveClaudeCredentialsPayload {
  readonly accountId: AccountId;
  readonly sessionKey: string;
  readonly orgId: string;
}

export interface UpdateSettingsPayload {
  readonly patch: Partial<AppSettings>;
}

export interface ProviderCommandPayload {
  readonly providerId: string;
}
