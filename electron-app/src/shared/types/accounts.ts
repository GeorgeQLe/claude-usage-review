export type AccountId = string;

export type AccountAuthStatus = "missing_credentials" | "configured" | "expired";

export interface AccountSummary {
  readonly id: AccountId;
  readonly label: string;
  readonly orgId: string | null;
  readonly isActive: boolean;
  readonly authStatus: AccountAuthStatus;
}
