import { describe, expect, it } from "vitest";
import { accountSummarySchema } from "./accounts.js";
import { claudeConnectionTestResultSchema } from "./ipc.js";

interface ClaudeUsageSchemasModule {
  readonly claudeUsageDataSchema: {
    readonly parse: (value: unknown) => unknown;
  };
}

const claudeUsageSchemaSpecifier = "./claudeUsage.js";

describe("Phase 2 Claude usage and account schema contracts", () => {
  it("validates exact Claude usage payloads with all known limit fields", async () => {
    const { claudeUsageDataSchema } = await loadClaudeUsageSchemasModule();

    expect(
      claudeUsageDataSchema.parse({
        fiveHour: { utilization: 0.42, resetsAt: "2026-04-15T17:00:00.000Z" },
        sevenDay: { utilization: 0.61, resetsAt: "2026-04-20T00:00:00.000Z" },
        sevenDaySonnet: { utilization: 0.2, resetsAt: "2026-04-20T00:00:00.000Z" },
        sevenDayOpus: { utilization: 0.7, resetsAt: "2026-04-20T00:00:00.000Z" },
        sevenDayOauthApps: { utilization: 0.1, resetsAt: "2026-04-20T00:00:00.000Z" },
        sevenDayCowork: { utilization: 0.12, resetsAt: "2026-04-20T00:00:00.000Z" },
        other: { utilization: 0.08, resetsAt: "2026-04-20T00:00:00.000Z" },
        extraUsage: { utilization: 0.31, resetsAt: null }
      })
    ).toMatchObject({
      fiveHour: { utilization: 0.42 },
      extraUsage: { utilization: 0.31 }
    });
  });

  it("keeps account summaries and connection results secret-free", () => {
    const accountSummary = accountSummarySchema.parse({
      id: "account-1",
      label: "Work",
      orgId: "org_123",
      isActive: true,
      authStatus: "configured",
      sessionKey: "sk-ant-sid01-secret"
    });

    expect(JSON.stringify(accountSummary)).not.toContain("sk-ant-sid01-secret");

    expect(
      claudeConnectionTestResultSchema.parse({
        ok: true,
        status: "connected",
        message: "Claude connection succeeded.",
        rotatedSessionKey: "sk-ant-sid01-rotated"
      })
    ).toEqual({
      ok: true,
      status: "connected",
      message: "Claude connection succeeded."
    });
  });
});

async function loadClaudeUsageSchemasModule(): Promise<ClaudeUsageSchemasModule> {
  return import(claudeUsageSchemaSpecifier) as Promise<ClaudeUsageSchemasModule>;
}
