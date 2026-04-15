import type { AccountSummary } from "../shared/types/accounts.js";
import type { AppSettings } from "../shared/types/settings.js";
import type { UsageState } from "../shared/types/usage.js";

export interface ClaudeUsageApi {
  readonly version: string;
  getUsageState: () => Promise<UsageState>;
  getSettings: () => Promise<AppSettings>;
  getAccounts: () => Promise<readonly AccountSummary[]>;
}

export function createClaudeUsageApi(): ClaudeUsageApi {
  return {
    version: "0.1.0",
    getUsageState: async () => ({
      activeProviderId: "claude",
      providers: [],
      lastUpdatedAt: null,
      warning: null
    }),
    getSettings: async () => ({
      launchAtLogin: false,
      timeDisplay: "countdown",
      paceTheme: "balanced",
      weeklyColorMode: "pace-aware",
      overlay: {
        enabled: false,
        layout: "compact",
        opacity: 0.9
      }
    }),
    getAccounts: async () => []
  };
}
