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

export type IpcChannelName = (typeof ipcChannelNames)[keyof typeof ipcChannelNames];
