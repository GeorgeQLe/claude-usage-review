import { describe, expect, it } from "vitest";

describe("Phase 4 provider schema red tests", () => {
  it("validates provider settings persistence beyond placeholder enablement", async () => {
    const schemas = await loadSchemas();

    expect(
      schemas.providerSettingsSchema.parse({
        adapterMode: "passive",
        authMode: "oauth-personal",
        enabled: true,
        lastRefreshAt: "2026-04-17T15:00:00.000Z",
        plan: "pro",
        profileLabel: "Work",
        setupPromptDismissed: true,
        staleAfterMinutes: 15
      })
    ).toMatchObject({
      authMode: "oauth-personal",
      enabled: true,
      plan: "pro",
      profileLabel: "Work"
    });
  });

  it("validates provider card diagnostics without accepting raw secrets or chat bodies", async () => {
    const schemas = await loadSchemas();

    const parsed = schemas.providerDiagnosticsSchema.parse({
      lastCheckedAt: "2026-04-17T15:00:00.000Z",
      messages: ["Codex history parsed with one malformed line."],
      providerId: "codex",
      redacted: true,
      status: "degraded"
    });

    expect(parsed).toMatchObject({
      providerId: "codex",
      redacted: true,
      status: "degraded"
    });
    expect(() =>
      schemas.providerDiagnosticsSchema.parse({
        lastCheckedAt: "2026-04-17T15:00:00.000Z",
        messages: ["access_token=secret prompt text"],
        providerId: "gemini",
        redacted: false,
        status: "ready"
      })
    ).toThrow();
  });
});

async function loadSchemas(): Promise<Record<string, { readonly parse: (value: unknown) => unknown }>> {
  const modulePath = "./provider.js";
  return import(modulePath) as Promise<Record<string, { readonly parse: (value: unknown) => unknown }>>;
}
