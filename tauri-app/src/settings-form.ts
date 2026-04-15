import { AccountInfo, UsageState } from "./types";

export interface SettingsAccountFormValues {
  accountName: string;
  orgId: string;
}

export function settingsAccountFormValues(
  account: AccountInfo,
  _state: UsageState
): SettingsAccountFormValues {
  return {
    accountName: account.name,
    orgId: account.org_id ?? "",
  };
}
