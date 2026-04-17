import type { ProviderCard, ProviderId } from "../../shared/types/provider.js";
import type { UsageState } from "../../shared/types/usage.js";

export interface ProviderCoordinatorSettings {
  readonly manualTrayProviderId: ProviderId | null;
  readonly pinnedProviderIds: readonly ProviderId[];
  readonly rotationEnabled: boolean;
  readonly staleAfterMs: number;
}

export interface ProviderCoordinatorSnapshotInput {
  readonly activeProviderId: ProviderId | null;
  readonly now: Date;
  readonly providers: readonly ProviderCard[];
  readonly settings: ProviderCoordinatorSettings;
}

export interface TrayRotationInput {
  readonly manualTrayProviderId: ProviderId | null;
  readonly now: Date;
  readonly pinnedProviderIds: readonly ProviderId[];
  readonly providers: readonly ProviderCard[];
  readonly staleAfterMs: number;
}

export interface TrayRotationResult {
  readonly activeProviderId: ProviderId | null;
  readonly cards: readonly ProviderCard[];
  readonly rotationProviderIds: readonly ProviderId[];
  readonly skippedProviderIds: readonly ProviderId[];
  readonly pinnedProviderIds: readonly ProviderId[];
}

const defaultProviderOrder = ["claude", "codex", "gemini"];

export function createProviderCoordinatorSnapshot(input: ProviderCoordinatorSnapshotInput): UsageState {
  const rotation = deriveTrayRotation({
    manualTrayProviderId: input.settings.manualTrayProviderId ?? input.activeProviderId,
    now: input.now,
    pinnedProviderIds: input.settings.pinnedProviderIds,
    providers: input.providers,
    staleAfterMs: input.settings.staleAfterMs
  });

  return {
    activeProviderId: rotation.activeProviderId,
    providers: rotation.cards,
    lastUpdatedAt: latestUpdatedAt(rotation.cards),
    warning: null
  };
}

export function deriveTrayRotation(input: TrayRotationInput): TrayRotationResult {
  const cards = sortProviderCards(input.providers).map((provider) =>
    markStaleProvider(provider, input.now, input.staleAfterMs)
  );
  const enabledCards = cards.filter((provider) => provider.enabled);
  const healthyProviderIds = enabledCards
    .filter((provider) => provider.status !== "degraded" && provider.status !== "missing_configuration" && provider.status !== "expired")
    .map((provider) => provider.providerId);
  const skippedProviderIds =
    healthyProviderIds.length > 0
      ? enabledCards.filter((provider) => provider.status === "degraded").map((provider) => provider.providerId)
      : [];
  const skipped = new Set(skippedProviderIds);
  const rotationProviderIds = orderRotationProviderIds({
    manualTrayProviderId: input.manualTrayProviderId,
    providerIds: cards
      .filter((provider) => provider.enabled && !skipped.has(provider.providerId) && provider.status !== "missing_configuration")
      .map((provider) => provider.providerId)
  });

  return {
    activeProviderId: rotationProviderIds[0] ?? null,
    cards,
    rotationProviderIds,
    skippedProviderIds,
    pinnedProviderIds: input.pinnedProviderIds.filter((providerId) =>
      cards.some((provider) => provider.providerId === providerId)
    )
  };
}

function sortProviderCards(providers: readonly ProviderCard[]): readonly ProviderCard[] {
  return [...providers].sort((left, right) => providerOrder(left.providerId) - providerOrder(right.providerId));
}

function providerOrder(providerId: ProviderId): number {
  const index = defaultProviderOrder.indexOf(providerId);
  return index === -1 ? defaultProviderOrder.length : index;
}

function markStaleProvider(provider: ProviderCard, now: Date, staleAfterMs: number): ProviderCard {
  if (!provider.enabled || provider.status !== "configured" || provider.lastUpdatedAt === null) {
    return provider;
  }

  const lastUpdatedAtMs = Date.parse(provider.lastUpdatedAt);
  if (!Number.isFinite(lastUpdatedAtMs) || now.getTime() - lastUpdatedAtMs <= staleAfterMs) {
    return provider;
  }

  const staleDetail = provider.detailText ? `${provider.detailText} Provider state is stale.` : "Provider state is stale.";

  return {
    ...provider,
    status: "stale",
    detailText: staleDetail
  };
}

function orderRotationProviderIds(input: {
  readonly manualTrayProviderId: ProviderId | null;
  readonly providerIds: readonly ProviderId[];
}): readonly ProviderId[] {
  if (!input.manualTrayProviderId || !input.providerIds.includes(input.manualTrayProviderId)) {
    return input.providerIds;
  }

  return [input.manualTrayProviderId, ...input.providerIds.filter((providerId) => providerId !== input.manualTrayProviderId)];
}

function latestUpdatedAt(providers: readonly ProviderCard[]): string | null {
  const latestMs = providers.reduce<number | null>((latest, provider) => {
    if (!provider.lastUpdatedAt) {
      return latest;
    }

    const next = Date.parse(provider.lastUpdatedAt);
    if (!Number.isFinite(next)) {
      return latest;
    }

    return latest === null || next > latest ? next : latest;
  }, null);

  return latestMs === null ? null : new Date(latestMs).toISOString();
}
