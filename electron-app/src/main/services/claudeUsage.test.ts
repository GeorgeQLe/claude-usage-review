import { describe, expect, it, vi } from "vitest";

interface ClaudeUsageClient {
  readonly fetchUsage: (credentials: { readonly orgId: string; readonly sessionKey: string }) => Promise<{
    readonly data: ClaudeUsageData;
    readonly rotatedSessionKey: string | null;
  }>;
}

interface ClaudeUsageData {
  readonly fiveHour: UsageLimit;
  readonly sevenDay: UsageLimit;
  readonly sevenDaySonnet: UsageLimit | null;
  readonly sevenDayOpus: UsageLimit | null;
  readonly sevenDayOauthApps: UsageLimit | null;
  readonly sevenDayCowork: UsageLimit | null;
  readonly other: UsageLimit | null;
  readonly extraUsage: UsageLimit | null;
}

interface UsageLimit {
  readonly utilization: number;
  readonly resetsAt: string | null;
}

interface ClaudeUsageModule {
  readonly createClaudeUsageClient: (options: { readonly fetch: typeof fetch }) => ClaudeUsageClient;
  readonly parseRotatedSessionKey: (headers: Headers) => string | null;
}

const claudeUsageModuleSpecifier = "./claudeUsage.js";

describe("Claude usage API client contract", () => {
  it("requests the Claude usage endpoint with the web client headers and session cookie", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(claudeUsageFixture()));
    const { createClaudeUsageClient } = await loadClaudeUsageModule();

    const client = createClaudeUsageClient({ fetch: fetchMock as never });

    await client.fetchUsage({
      orgId: "org_123",
      sessionKey: "sk-ant-sid01-current"
    });

    expect(fetchMock).toHaveBeenCalledWith("https://claude.ai/api/organizations/org_123/usage", {
      headers: {
        accept: "*/*",
        "anthropic-client-platform": "web_claude_ai",
        "content-type": "application/json",
        Cookie: "sessionKey=sk-ant-sid01-current"
      },
      method: "GET"
    });
  });

  it("parses all known Claude limit fields into normalized camel-case usage data", async () => {
    const { createClaudeUsageClient } = await loadClaudeUsageModule();
    const client = createClaudeUsageClient({
      fetch: vi.fn(async () => jsonResponse(claudeUsageFixture())) as never
    });

    await expect(
      client.fetchUsage({
        orgId: "org_123",
        sessionKey: "sk-ant-sid01-current"
      })
    ).resolves.toEqual({
      data: {
        fiveHour: { utilization: 0.42, resetsAt: "2026-04-15T17:00:00.000Z" },
        sevenDay: { utilization: 0.61, resetsAt: "2026-04-20T00:00:00.000Z" },
        sevenDaySonnet: { utilization: 0.2, resetsAt: "2026-04-20T00:00:00.000Z" },
        sevenDayOpus: { utilization: 0.7, resetsAt: "2026-04-20T00:00:00.000Z" },
        sevenDayOauthApps: { utilization: 0.1, resetsAt: "2026-04-20T00:00:00.000Z" },
        sevenDayCowork: { utilization: 0.12, resetsAt: "2026-04-20T00:00:00.000Z" },
        other: { utilization: 0.08, resetsAt: "2026-04-20T00:00:00.000Z" },
        extraUsage: { utilization: 0.31, resetsAt: null }
      },
      rotatedSessionKey: null
    });
  });

  it("extracts rotated session keys from Set-Cookie without exposing other cookie values", async () => {
    const { createClaudeUsageClient, parseRotatedSessionKey } = await loadClaudeUsageModule();
    const headers = new Headers({
      "set-cookie": "cf_clearance=private; Path=/, sessionKey=sk-ant-sid01-rotated; Path=/; HttpOnly; Secure"
    });

    expect(parseRotatedSessionKey(headers)).toBe("sk-ant-sid01-rotated");

    const client = createClaudeUsageClient({
      fetch: vi.fn(async () => jsonResponse(claudeUsageFixture(), { headers })) as never
    });

    await expect(
      client.fetchUsage({
        orgId: "org_123",
        sessionKey: "sk-ant-sid01-current"
      })
    ).resolves.toMatchObject({
      rotatedSessionKey: "sk-ant-sid01-rotated"
    });
  });

  it("classifies auth expiry, network errors, and malformed responses distinctly", async () => {
    const { createClaudeUsageClient } = await loadClaudeUsageModule();

    await expect(
      createClaudeUsageClient({
        fetch: vi.fn(async () => jsonResponse({ error: "expired" }, { status: 401 })) as never
      }).fetchUsage({ orgId: "org_123", sessionKey: "expired" })
    ).rejects.toMatchObject({ kind: "auth_expired", statusCode: 401 });

    await expect(
      createClaudeUsageClient({
        fetch: vi.fn(async () => {
          throw new TypeError("socket closed");
        }) as never
      }).fetchUsage({ orgId: "org_123", sessionKey: "current" })
    ).rejects.toMatchObject({ kind: "network_error" });

    await expect(
      createClaudeUsageClient({
        fetch: vi.fn(async () => jsonResponse({ five_hour: "bad" })) as never
      }).fetchUsage({ orgId: "org_123", sessionKey: "current" })
    ).rejects.toMatchObject({ kind: "invalid_response" });
  });
});

async function loadClaudeUsageModule(): Promise<ClaudeUsageModule> {
  return import(claudeUsageModuleSpecifier) as Promise<ClaudeUsageModule>;
}

function jsonResponse(body: unknown, options: { readonly status?: number; readonly headers?: Headers } = {}): Response {
  return new Response(JSON.stringify(body), {
    headers: options.headers ?? new Headers({ "content-type": "application/json" }),
    status: options.status ?? 200
  });
}

function claudeUsageFixture() {
  return {
    five_hour: {
      utilization: 0.42,
      resets_at: "2026-04-15T17:00:00.000Z"
    },
    seven_day: {
      utilization: 0.61,
      resets_at: "2026-04-20T00:00:00.000Z"
    },
    seven_day_sonnet: {
      utilization: 0.2,
      resets_at: "2026-04-20T00:00:00.000Z"
    },
    seven_day_opus: {
      utilization: 0.7,
      resets_at: "2026-04-20T00:00:00.000Z"
    },
    seven_day_oauth_apps: {
      utilization: 0.1,
      resets_at: "2026-04-20T00:00:00.000Z"
    },
    seven_day_cowork: {
      utilization: 0.12,
      resets_at: "2026-04-20T00:00:00.000Z"
    },
    iguana_necktie: {
      utilization: 0.08,
      resets_at: "2026-04-20T00:00:00.000Z"
    },
    extra_usage: {
      is_enabled: true,
      monthly_limit: 100,
      used_credits: 31,
      utilization: 0.31
    }
  };
}
