import { describe, expect, it } from "vitest";
import type { ProviderCard } from "../../shared/types/provider.js";

describe("Phase 4 provider coordinator red tests", () => {
  it("normalizes Claude, Codex, and Gemini into first-class provider cards", async () => {
    const coordinator = await loadCoordinator();

    const snapshot = coordinator.createProviderCoordinatorSnapshot({
      activeProviderId: "claude",
      now: new Date("2026-04-17T15:00:00.000Z"),
      providers: [
        providerCard({ providerId: "claude", displayName: "Claude", confidence: "exact" }),
        providerCard({
          providerId: "codex",
          displayName: "Codex",
          confidence: "estimated",
          detailText: "Passive history window",
          sessionUtilization: null
        }),
        providerCard({
          providerId: "gemini",
          displayName: "Gemini",
          confidence: "high_confidence",
          dailyRequestCount: 42,
          requestsPerMinute: 4
        })
      ],
      settings: {
        manualTrayProviderId: null,
        pinnedProviderIds: [],
        rotationEnabled: true,
        staleAfterMs: 15 * 60 * 1000
      }
    });

    expect(snapshot.providers.map((provider: ProviderCard) => provider.providerId)).toEqual([
      "claude",
      "codex",
      "gemini"
    ]);
    expect(snapshot.providers.find((provider: ProviderCard) => provider.providerId === "codex")).toMatchObject({
      confidence: "estimated",
      headline: expect.stringContaining("Codex")
    });
    expect(snapshot.providers.find((provider: ProviderCard) => provider.providerId === "gemini")).toMatchObject({
      dailyRequestCount: 42,
      requestsPerMinute: 4
    });
  });

  it("maps stale, degraded, missing, manual override, and pinned providers for tray rotation", async () => {
    const coordinator = await loadCoordinator();
    const now = new Date("2026-04-17T15:30:00.000Z");
    const providers = [
      providerCard({
        providerId: "claude",
        displayName: "Claude",
        lastUpdatedAt: "2026-04-17T15:29:00.000Z",
        sessionUtilization: 0.32
      }),
      providerCard({
        providerId: "codex",
        displayName: "Codex",
        lastUpdatedAt: "2026-04-17T13:00:00.000Z",
        sessionUtilization: null
      }),
      providerCard({
        providerId: "gemini",
        displayName: "Gemini",
        status: "degraded",
        lastUpdatedAt: "2026-04-17T15:28:00.000Z"
      })
    ];

    const rotation = coordinator.deriveTrayRotation({
      manualTrayProviderId: "codex",
      now,
      pinnedProviderIds: ["gemini"],
      providers,
      staleAfterMs: 30 * 60 * 1000
    });

    expect(rotation.activeProviderId).toBe("codex");
    expect(rotation.cards.find((card: ProviderCard) => card.providerId === "codex")).toMatchObject({
      status: "stale",
      detailText: expect.stringContaining("stale")
    });
    expect(rotation.rotationProviderIds).toEqual(["codex", "claude"]);
    expect(rotation.skippedProviderIds).toEqual(["gemini"]);
    expect(rotation.pinnedProviderIds).toEqual(["gemini"]);
  });
});

function providerCard(patch: Partial<ProviderCard> & Pick<ProviderCard, "providerId" | "displayName">): ProviderCard {
  const { displayName, providerId, ...rest } = patch;

  return {
    actions: [],
    adapterMode: "passive",
    confidence: "observed_only",
    confidenceExplanation: "Observed from local provider activity.",
    dailyRequestCount: null,
    detailText: null,
    enabled: true,
    headline: `${displayName} usage`,
    lastUpdatedAt: "2026-04-17T15:00:00.000Z",
    providerId,
    requestsPerMinute: null,
    resetAt: null,
    sessionUtilization: 0.2,
    status: "configured",
    weeklyUtilization: null,
    displayName,
    ...rest
  };
}

async function loadCoordinator(): Promise<Record<string, any>> {
  const modulePath = "./providerCoordinator.js";
  return import(modulePath) as Promise<Record<string, any>>;
}
