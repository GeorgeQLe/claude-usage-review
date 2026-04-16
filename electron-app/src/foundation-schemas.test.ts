import { describe, expect, it } from "vitest";
import { accountSummarySchema } from "./shared/schemas/accounts.js";
import {
  addAccountPayloadSchema,
  claudeConnectionTestResultSchema,
  diagnosticsExportResultSchema,
  providerCommandPayloadSchema,
  saveClaudeCredentialsPayloadSchema,
  updateSettingsPayloadSchema,
  wrapperSetupResultSchema
} from "./shared/schemas/ipc.js";
import { appSettingsSchema } from "./shared/schemas/settings.js";
import { usageStateSchema } from "./shared/schemas/usage.js";

describe("foundation IPC schemas", () => {
  it("accepts valid payloads and rejects empty command identifiers", () => {
    expect(addAccountPayloadSchema.parse({ label: "Work" })).toEqual({ label: "Work" });
    expect(providerCommandPayloadSchema.parse({ providerId: "codex" })).toEqual({ providerId: "codex" });

    expect(() => addAccountPayloadSchema.parse({ label: "" })).toThrow();
    expect(() => providerCommandPayloadSchema.parse({ providerId: "" })).toThrow();
  });

  it("validates credential payloads without allowing secret-bearing result shapes", () => {
    expect(
      saveClaudeCredentialsPayloadSchema.parse({
        accountId: "account-1",
        sessionKey: "synthetic-session-secret",
        orgId: "org_123"
      })
    ).toEqual({
      accountId: "account-1",
      sessionKey: "synthetic-session-secret",
      orgId: "org_123"
    });

    const result = claudeConnectionTestResultSchema.parse({
      ok: false,
      status: "not_implemented",
      message: "Not connected yet."
    });

    expect(JSON.stringify(result)).not.toContain("sessionKey");
    expect(JSON.stringify(result)).not.toContain("synthetic-session-secret");
  });

  it("validates partial settings updates and canonical placeholder response state", () => {
    const settings = appSettingsSchema.parse({
      launchAtLogin: false,
      timeDisplay: "countdown",
      paceTheme: "balanced",
      weeklyColorMode: "pace-aware",
      overlay: {
        enabled: false,
        visible: false,
        layout: "compact",
        opacity: 0.9,
        bounds: null
      },
      providers: {
        codex: {
          enabled: false,
          setupPromptDismissed: false
        },
        gemini: {
          enabled: false,
          setupPromptDismissed: false
        }
      },
      migration: {
        swiftAppImport: true,
        providerImport: true
      },
      notifications: {
        enabled: true,
        sessionReset: true,
        weeklyReset: true,
        authExpired: true,
        providerDegraded: false,
        thresholdWarnings: true,
        sessionWarningPercent: 80,
        weeklyWarningPercent: 80
      },
      onboarding: {
        completed: false,
        skipped: false
      }
    });

    expect(
      updateSettingsPayloadSchema.parse({
        patch: {
          overlay: { enabled: true },
          providers: { codex: { enabled: true } },
          notifications: { weeklyWarningPercent: 85 }
        }
      })
    ).toEqual({
      patch: {
        overlay: { enabled: true },
        providers: { codex: { enabled: true } },
        notifications: { weeklyWarningPercent: 85 }
      }
    });
    expect(settings.overlay.layout).toBe("compact");
    expect(settings.notifications.weeklyWarningPercent).toBe(80);
    expect(
      updateSettingsPayloadSchema.parse({
        patch: {
          overlay: {
            bounds: {
              x: -1200,
              y: 24,
              width: 320,
              height: 180
            },
            visible: true
          }
        }
      })
    ).toEqual({
      patch: {
        overlay: {
          bounds: {
            x: -1200,
            y: 24,
            width: 320,
            height: 180
          },
          visible: true
        }
      }
    });
  });

  it("validates account and usage response shapes used by the preload bridge", () => {
    expect(
      accountSummarySchema.parse({
        id: "local-placeholder",
        label: "Local placeholder",
        orgId: null,
        isActive: true,
        authStatus: "missing_credentials"
      })
    ).toMatchObject({ id: "local-placeholder", isActive: true });

    const usageState = usageStateSchema.parse({
      activeProviderId: "claude",
      providers: [
        {
          providerId: "claude",
          displayName: "Claude",
          enabled: true,
          status: "missing_configuration",
          confidence: "observed_only",
          headline: "Claude not configured",
          detailText: "Connect storage and provider services in a later phase.",
          sessionUtilization: null,
          weeklyUtilization: null,
          dailyRequestCount: null,
          requestsPerMinute: null,
          resetAt: null,
          lastUpdatedAt: null,
          adapterMode: "passive",
          confidenceExplanation: "Foundation placeholder state only.",
          actions: []
        }
      ],
      lastUpdatedAt: null,
      warning: null
    });

    expect(usageState.providers[0]?.providerId).toBe("claude");
  });

  it("validates wrapper and diagnostics placeholder responses", () => {
    expect(
      wrapperSetupResultSchema.parse({
        providerId: "gemini",
        command: null,
        instructions: ["Wrapper generation is not connected in the foundation IPC skeleton."],
        verified: false
      })
    ).toMatchObject({ providerId: "gemini", verified: false });

    expect(
      diagnosticsExportResultSchema.parse({
        generatedAt: "2026-04-15T12:00:00.000Z",
        summary: "Diagnostics export is not connected in the foundation IPC skeleton.",
        entries: []
      })
    ).toMatchObject({ entries: [] });
  });
});
