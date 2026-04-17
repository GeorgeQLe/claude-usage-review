import { describe, expect, it, vi } from "vitest";
import type { GitHubContributionWeek } from "../../shared/types/ipc.js";
import {
  buildGitHubContributionRequest,
  createGitHubContributionClient,
  createGitHubHeatmapController,
  parseGitHubContributionResponse,
  type GitHubHeatmapPersistenceState
} from "./github.js";

describe("GitHub contribution heatmap regressions", () => {
  it("builds a token-free GraphQL variables request for contribution calendars", () => {
    const request = buildGitHubContributionRequest({
      token: "ghp_secret",
      username: 'octo"cat'
    });
    const body = JSON.parse(request.body) as {
      readonly query: string;
      readonly variables: { readonly login: string };
    };

    expect(request).toMatchObject({
      method: "POST",
      url: "https://api.github.com/graphql",
      headers: {
        authorization: "bearer ghp_secret",
        "content-type": "application/json",
        "user-agent": "ClaudeUsage Electron"
      }
    });
    expect(body.variables).toEqual({ login: 'octo"cat' });
    expect(body.query).toContain("query($login: String!)");
    expect(body.query).not.toContain('octo"cat');
    expect(request.body).not.toContain("ghp_secret");
  });

  it("normalizes valid contribution responses to the last 12 weeks", () => {
    const result = parseGitHubContributionResponse(githubPayload(13));

    expect(result.totalContributions).toBe(91);
    expect(result.weeks).toHaveLength(12);
    expect(result.weeks[0]?.contributionDays[0]).toEqual({
      contributionCount: 1,
      date: "2026-01-02"
    });
    expect(result.weeks.at(-1)?.contributionDays[0]).toEqual({
      contributionCount: 12,
      date: "2026-01-13"
    });
  });

  it("classifies GitHub auth, HTTP, network, and malformed-response failures", async () => {
    await expect(
      createGitHubContributionClient({
        fetch: vi.fn(async () => jsonResponse({ message: "bad credentials" }, { status: 401 })) as never
      }).fetchContributions({ token: "expired", username: "octocat" })
    ).rejects.toMatchObject({ kind: "auth_expired", statusCode: 401 });

    await expect(
      createGitHubContributionClient({
        fetch: vi.fn(async () => jsonResponse({ message: "rate limited" }, { status: 429 })) as never
      }).fetchContributions({ token: "current", username: "octocat" })
    ).rejects.toMatchObject({ kind: "http_error", statusCode: 429 });

    await expect(
      createGitHubContributionClient({
        fetch: vi.fn(async () => {
          throw new TypeError("socket closed");
        }) as never
      }).fetchContributions({ token: "current", username: "octocat" })
    ).rejects.toMatchObject({ kind: "network_error" });

    await expect(
      createGitHubContributionClient({
        fetch: vi.fn(async () => jsonResponse({ data: { user: null } })) as never
      }).fetchContributions({ token: "current", username: "octocat" })
    ).rejects.toMatchObject({ kind: "invalid_response" });
  });

  it("keeps disabled and not-configured heatmap state token-free", () => {
    const harness = createControllerHarness({
      token: "ghp_secret",
      state: {
        enabled: false,
        error: null,
        lastFetchedAt: "2026-04-15T11:00:00.000Z",
        totalContributions: 12,
        username: "octocat",
        weeks: [week("2026-04-15", 4)]
      }
    });

    expect(harness.controller.getHeatmapState()).toEqual({
      configured: false,
      enabled: false,
      error: null,
      lastFetchedAt: null,
      nextRefreshAt: null,
      status: "disabled",
      totalContributions: 0,
      username: "octocat",
      weeks: []
    });

    const notConfigured = harness.controller.saveSettings({
      enabled: true,
      token: null,
      username: "  "
    });
    expect(notConfigured).toMatchObject({
      configured: false,
      enabled: true,
      status: "not_configured",
      totalContributions: 0,
      username: null,
      weeks: []
    });
    expect(harness.token).toBeNull();
  });

  it("suppresses hourly refreshes unless forced and writes sanitized results", async () => {
    const fetchedWeeks = [week("2026-04-15", 5)];
    const fetchContributions = vi.fn(async () => ({
      totalContributions: 5,
      weeks: fetchedWeeks
    }));
    const harness = createControllerHarness({
      client: { fetchContributions },
      now: () => "2026-04-15T12:30:00.000Z",
      token: "ghp_secret",
      state: {
        enabled: true,
        error: null,
        lastFetchedAt: "2026-04-15T12:00:00.000Z",
        totalContributions: 2,
        username: "octocat",
        weeks: [week("2026-04-14", 2)]
      }
    });

    await expect(harness.controller.refreshHeatmap()).resolves.toMatchObject({
      nextRefreshAt: "2026-04-15T13:00:00.000Z",
      status: "ready",
      totalContributions: 2
    });
    expect(fetchContributions).not.toHaveBeenCalled();

    await expect(harness.controller.refreshHeatmap({ force: true })).resolves.toMatchObject({
      lastFetchedAt: "2026-04-15T12:30:00.000Z",
      nextRefreshAt: "2026-04-15T13:30:00.000Z",
      status: "ready",
      totalContributions: 5,
      weeks: fetchedWeeks
    });
    expect(fetchContributions).toHaveBeenCalledWith({
      token: "ghp_secret",
      username: "octocat"
    });
    expect(JSON.stringify(harness.state)).not.toContain("ghp_secret");
  });

  it("surfaces auth-expired refresh failures without clearing cached heatmap data", async () => {
    const authError = Object.assign(new Error("GitHub token is invalid or expired."), {
      kind: "auth_expired"
    });
    const harness = createControllerHarness({
      client: {
        fetchContributions: vi.fn(async () => {
          throw authError;
        })
      },
      token: "ghp_secret",
      state: {
        enabled: true,
        error: null,
        lastFetchedAt: null,
        totalContributions: 2,
        username: "octocat",
        weeks: [week("2026-04-14", 2)]
      }
    });

    await expect(harness.controller.refreshHeatmap({ force: true })).resolves.toMatchObject({
      error: "GitHub token is invalid or expired.",
      status: "auth_expired",
      totalContributions: 2,
      weeks: [week("2026-04-14", 2)]
    });
  });
});

function createControllerHarness(options: {
  readonly client?: Parameters<typeof createGitHubHeatmapController>[0]["client"];
  readonly now?: () => string;
  readonly state: GitHubHeatmapPersistenceState;
  readonly token: string | null;
}) {
  let state = options.state;
  let token = options.token;
  const controller = createGitHubHeatmapController({
    client: options.client,
    deleteToken: () => {
      token = null;
    },
    now: options.now ?? (() => "2026-04-15T12:00:00.000Z"),
    readState: () => state,
    readToken: () => token,
    writeState: (nextState) => {
      state = nextState;
    },
    writeToken: (nextToken) => {
      token = nextToken;
    }
  });

  return {
    controller,
    get state() {
      return state;
    },
    get token() {
      return token;
    }
  };
}

function jsonResponse(body: unknown, options: { readonly status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json"
    },
    status: options.status ?? 200
  });
}

function githubPayload(weekCount: number): unknown {
  return {
    data: {
      user: {
        contributionsCollection: {
          contributionCalendar: {
            totalContributions: 91,
            weeks: Array.from({ length: weekCount }, (_value, index) => ({
              contributionDays: [
                {
                  contributionCount: index,
                  date: `2026-01-${String(index + 1).padStart(2, "0")}`
                }
              ]
            }))
          }
        }
      }
    }
  };
}

function week(date: string, contributionCount: number): GitHubContributionWeek {
  return {
    contributionDays: [
      {
        contributionCount,
        date
      }
    ]
  };
}
