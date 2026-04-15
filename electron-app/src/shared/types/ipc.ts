import type { AccountId } from "./accounts.js";
import type { AppSettings } from "./settings.js";

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
