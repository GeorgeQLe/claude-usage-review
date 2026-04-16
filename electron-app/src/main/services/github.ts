import type {
  GitHubContributionWeek,
  GitHubHeatmapResult,
  SaveGitHubSettingsPayload
} from "../../shared/types/ipc.js";

export interface GitHubCredentials {
  readonly username: string;
  readonly token: string;
}

export interface GitHubContributionRequest {
  readonly url: string;
  readonly method: "POST";
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

export interface GitHubContributionClient {
  readonly fetchContributions: (credentials: GitHubCredentials) => Promise<GitHubContributionFetchResult>;
}

export interface GitHubContributionFetchResult {
  readonly weeks: readonly GitHubContributionWeek[];
  readonly totalContributions: number;
}

export interface GitHubHeatmapPersistenceState {
  readonly enabled: boolean;
  readonly username: string | null;
  readonly weeks: readonly GitHubContributionWeek[];
  readonly totalContributions: number;
  readonly lastFetchedAt: string | null;
  readonly error: string | null;
}

export interface GitHubHeatmapControllerOptions {
  readonly readState: () => GitHubHeatmapPersistenceState | null;
  readonly writeState: (state: GitHubHeatmapPersistenceState) => void;
  readonly readToken: () => string | null;
  readonly writeToken: (token: string) => void;
  readonly deleteToken: () => void;
  readonly client?: GitHubContributionClient;
  readonly now?: () => string;
}

export interface GitHubHeatmapController {
  readonly getHeatmapState: () => GitHubHeatmapResult;
  readonly saveSettings: (payload: SaveGitHubSettingsPayload) => GitHubHeatmapResult;
  readonly refreshHeatmap: (options?: { readonly force?: boolean }) => Promise<GitHubHeatmapResult>;
}

export type GitHubServiceErrorKind = "auth_expired" | "http_error" | "network_error" | "invalid_response";

export interface GitHubServiceError extends Error {
  readonly kind: GitHubServiceErrorKind;
  readonly statusCode?: number;
}

interface GraphQLContributionDay {
  readonly date?: unknown;
  readonly contributionCount?: unknown;
}

interface GraphQLContributionWeek {
  readonly contributionDays?: unknown;
}

const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";
const REFRESH_INTERVAL_MS = 60 * 60 * 1000;

export const githubContributionCalendarQuery = `
query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            date
            contributionCount
          }
        }
      }
    }
  }
}
`.trim();

export function buildGitHubContributionRequest(credentials: GitHubCredentials): GitHubContributionRequest {
  return {
    url: GITHUB_GRAPHQL_URL,
    method: "POST",
    headers: {
      authorization: `bearer ${credentials.token}`,
      "content-type": "application/json",
      "user-agent": "ClaudeUsage Electron"
    },
    body: JSON.stringify({
      query: githubContributionCalendarQuery,
      variables: {
        login: credentials.username
      }
    })
  };
}

export function createGitHubContributionClient(
  options: { readonly fetch?: typeof fetch } = {}
): GitHubContributionClient {
  const fetchImpl = options.fetch ?? fetch;

  return {
    fetchContributions: async (credentials: GitHubCredentials): Promise<GitHubContributionFetchResult> => {
      const request = buildGitHubContributionRequest(credentials);

      let response: Response;
      try {
        response = await fetchImpl(request.url, {
          body: request.body,
          headers: request.headers,
          method: request.method
        });
      } catch (error) {
        throw createGitHubServiceError("network_error", "GitHub contribution request failed.", undefined, error);
      }

      if (response.status === 401 || response.status === 403) {
        throw createGitHubServiceError("auth_expired", "GitHub token is invalid or expired.", response.status);
      }

      if (!response.ok) {
        throw createGitHubServiceError("http_error", `GitHub returned HTTP ${response.status}.`, response.status);
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch (error) {
        throw createGitHubServiceError("invalid_response", "GitHub returned malformed JSON.", undefined, error);
      }

      return parseGitHubContributionResponse(payload);
    }
  };
}

export function parseGitHubContributionResponse(payload: unknown): GitHubContributionFetchResult {
  if (!isRecord(payload)) {
    throw createGitHubServiceError("invalid_response", "GitHub response was not an object.");
  }

  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    throw createGitHubServiceError("invalid_response", "GitHub GraphQL returned errors.");
  }

  const calendar = getContributionCalendar(payload);
  const totalContributions = calendar.totalContributions;
  const weeks = calendar.weeks;

  if (typeof totalContributions !== "number" || !Number.isInteger(totalContributions) || totalContributions < 0 || !Array.isArray(weeks)) {
    throw createGitHubServiceError("invalid_response", "GitHub contribution calendar was incomplete.");
  }

  return {
    totalContributions,
    weeks: normalizeLast12Weeks(weeks.map(parseContributionWeek))
  };
}

export function createGitHubHeatmapController(options: GitHubHeatmapControllerOptions): GitHubHeatmapController {
  const client = options.client ?? createGitHubContributionClient();
  const now = options.now ?? (() => new Date().toISOString());

  return {
    getHeatmapState: (): GitHubHeatmapResult => createHeatmapResult(readState(), options.readToken() !== null, now()),
    saveSettings: (payload: SaveGitHubSettingsPayload): GitHubHeatmapResult => {
      const current = readState();
      const username = normalizeUsername(payload.username);

      if (payload.token === null) {
        options.deleteToken();
      } else if (payload.token) {
        options.writeToken(payload.token);
      }

      const shouldClearCachedData = username !== current.username || payload.token !== undefined;
      const nextState: GitHubHeatmapPersistenceState = {
        ...current,
        enabled: payload.enabled,
        weeks: shouldClearCachedData ? [] : current.weeks,
        totalContributions: shouldClearCachedData ? 0 : current.totalContributions,
        lastFetchedAt: shouldClearCachedData ? null : current.lastFetchedAt,
        username,
        error: null
      };
      options.writeState(nextState);

      return createHeatmapResult(nextState, options.readToken() !== null, now());
    },
    refreshHeatmap: async (refreshOptions: { readonly force?: boolean } = {}): Promise<GitHubHeatmapResult> => {
      const current = readState();
      const token = options.readToken();
      const currentTime = now();
      const currentResult = createHeatmapResult(current, token !== null, currentTime);

      if (!current.enabled || !current.username || !token) {
        return currentResult;
      }

      if (!refreshOptions.force && current.lastFetchedAt && Date.parse(current.lastFetchedAt) + REFRESH_INTERVAL_MS > Date.parse(currentTime)) {
        return currentResult;
      }

      try {
        const fetched = await client.fetchContributions({
          username: current.username,
          token
        });
        const nextState: GitHubHeatmapPersistenceState = {
          enabled: current.enabled,
          error: null,
          lastFetchedAt: currentTime,
          totalContributions: fetched.totalContributions,
          username: current.username,
          weeks: fetched.weeks
        };
        options.writeState(nextState);
        return createHeatmapResult(nextState, true, currentTime);
      } catch (error) {
        const nextState: GitHubHeatmapPersistenceState = {
          ...current,
          error: getGitHubErrorMessage(error)
        };
        options.writeState(nextState);
        return {
          ...createHeatmapResult(nextState, true, currentTime),
          status: isGitHubServiceError(error) && error.kind === "auth_expired" ? "auth_expired" : "error"
        };
      }
    }
  };

  function readState(): GitHubHeatmapPersistenceState {
    return options.readState() ?? createDefaultGitHubHeatmapState();
  }
}

export function createDefaultGitHubHeatmapState(): GitHubHeatmapPersistenceState {
  return {
    enabled: false,
    username: null,
    weeks: [],
    totalContributions: 0,
    lastFetchedAt: null,
    error: null
  };
}

function createHeatmapResult(
  state: GitHubHeatmapPersistenceState,
  hasToken: boolean,
  nowIso: string
): GitHubHeatmapResult {
  const configured = state.enabled && state.username !== null && hasToken;
  const nextRefreshAt = state.lastFetchedAt
    ? new Date(Date.parse(state.lastFetchedAt) + REFRESH_INTERVAL_MS).toISOString()
    : null;

  return {
    enabled: state.enabled,
    configured,
    username: state.username,
    status: getHeatmapStatus(state, hasToken),
    weeks: configured ? state.weeks : [],
    totalContributions: configured ? state.totalContributions : 0,
    lastFetchedAt: configured ? state.lastFetchedAt : null,
    nextRefreshAt: configured && nextRefreshAt && Date.parse(nextRefreshAt) > Date.parse(nowIso) ? nextRefreshAt : null,
    error: configured ? state.error : null
  };
}

function getHeatmapStatus(state: GitHubHeatmapPersistenceState, hasToken: boolean): GitHubHeatmapResult["status"] {
  if (!state.enabled) {
    return "disabled";
  }

  if (!state.username || !hasToken) {
    return "not_configured";
  }

  if (state.error) {
    return "error";
  }

  return state.weeks.length > 0 ? "ready" : "configured";
}

function normalizeUsername(username: string | null): string | null {
  const trimmed = username?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function getContributionCalendar(payload: Record<string, unknown>): Record<string, unknown> {
  const data = payload.data;
  if (!isRecord(data)) {
    throw createGitHubServiceError("invalid_response", "GitHub response did not include data.");
  }

  const user = data.user;
  if (!isRecord(user)) {
    throw createGitHubServiceError("invalid_response", "GitHub user was not found.");
  }

  const collection = user.contributionsCollection;
  if (!isRecord(collection)) {
    throw createGitHubServiceError("invalid_response", "GitHub contribution collection was not found.");
  }

  const calendar = collection.contributionCalendar;
  if (!isRecord(calendar)) {
    throw createGitHubServiceError("invalid_response", "GitHub contribution calendar was not found.");
  }

  return calendar;
}

function parseContributionWeek(week: GraphQLContributionWeek): GitHubContributionWeek {
  if (!Array.isArray(week.contributionDays)) {
    throw createGitHubServiceError("invalid_response", "GitHub contribution week was invalid.");
  }

  return {
    contributionDays: week.contributionDays.map(parseContributionDay)
  };
}

function parseContributionDay(day: GraphQLContributionDay): { readonly date: string; readonly contributionCount: number } {
  if (typeof day.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(day.date)) {
    throw createGitHubServiceError("invalid_response", "GitHub contribution day date was invalid.");
  }

  if (
    typeof day.contributionCount !== "number" ||
    !Number.isInteger(day.contributionCount) ||
    day.contributionCount < 0
  ) {
    throw createGitHubServiceError("invalid_response", "GitHub contribution count was invalid.");
  }

  return {
    date: day.date,
    contributionCount: day.contributionCount
  };
}

function normalizeLast12Weeks(weeks: readonly GitHubContributionWeek[]): readonly GitHubContributionWeek[] {
  return weeks.length <= 12 ? weeks : weeks.slice(-12);
}

function getGitHubErrorMessage(error: unknown): string {
  if (isGitHubServiceError(error)) {
    return error.message;
  }

  return "GitHub contributions could not be refreshed.";
}

function createGitHubServiceError(
  kind: GitHubServiceErrorKind,
  message: string,
  statusCode?: number,
  cause?: unknown
): GitHubServiceError {
  const error = new Error(message, { cause }) as GitHubServiceError;
  Object.defineProperty(error, "kind", {
    enumerable: true,
    value: kind
  });
  if (statusCode !== undefined) {
    Object.defineProperty(error, "statusCode", {
      enumerable: true,
      value: statusCode
    });
  }
  return error;
}

function isGitHubServiceError(error: unknown): error is GitHubServiceError {
  return typeof error === "object" && error !== null && "kind" in error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
