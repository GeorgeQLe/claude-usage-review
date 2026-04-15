import type { ProviderCard, ProviderId } from "./provider.js";

export interface UsageState {
  readonly activeProviderId: ProviderId | null;
  readonly providers: readonly ProviderCard[];
  readonly lastUpdatedAt: string | null;
  readonly warning: string | null;
}
