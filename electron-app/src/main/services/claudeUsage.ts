export interface ClaudeUsageClientOptions {
  readonly fetch: typeof fetch;
}

export interface ClaudeUsageCredentials {
  readonly orgId: string;
  readonly sessionKey: string;
}

export interface ClaudeUsageClient {
  readonly fetchUsage: (credentials: ClaudeUsageCredentials) => Promise<ClaudeUsageResult>;
}

export interface ClaudeUsageResult {
  readonly data: ClaudeUsageData;
  readonly rotatedSessionKey: string | null;
}

export interface ClaudeUsageData {
  readonly fiveHour: UsageLimit;
  readonly sevenDay: UsageLimit;
  readonly sevenDaySonnet: UsageLimit | null;
  readonly sevenDayOpus: UsageLimit | null;
  readonly sevenDayOauthApps: UsageLimit | null;
  readonly sevenDayCowork: UsageLimit | null;
  readonly other: UsageLimit | null;
  readonly extraUsage: UsageLimit | null;
}

export interface UsageLimit {
  readonly utilization: number;
  readonly resetsAt: string | null;
}

export interface ClaudeAuthExpiredError {
  readonly kind: "auth_expired";
  readonly statusCode: 401 | 403;
}

export interface ClaudeNetworkError {
  readonly kind: "network_error";
  readonly error: unknown;
}

export interface ClaudeInvalidResponseError {
  readonly kind: "invalid_response";
  readonly error?: unknown;
}

type ClaudeUsageError = ClaudeAuthExpiredError | ClaudeNetworkError | ClaudeInvalidResponseError;

type ClaudeUsagePayload = Record<string, unknown>;

const CLAUDE_USAGE_ENDPOINT_BASE = "https://claude.ai/api/organizations";
const KNOWN_LIMIT_FIELDS = new Set([
  "five_hour",
  "seven_day",
  "seven_day_sonnet",
  "seven_day_opus",
  "seven_day_oauth_apps",
  "seven_day_cowork",
  "extra_usage"
]);

export function createClaudeUsageClient(options: ClaudeUsageClientOptions): ClaudeUsageClient {
  return {
    fetchUsage: async (credentials: ClaudeUsageCredentials): Promise<ClaudeUsageResult> => {
      let response: Response;

      try {
        response = await options.fetch(`${CLAUDE_USAGE_ENDPOINT_BASE}/${credentials.orgId}/usage`, {
          headers: {
            accept: "*/*",
            "anthropic-client-platform": "web_claude_ai",
            "content-type": "application/json",
            Cookie: `sessionKey=${credentials.sessionKey}`
          },
          method: "GET"
        });
      } catch (error) {
        throw createNetworkError(error);
      }

      if (response.status === 401 || response.status === 403) {
        throw createAuthExpiredError(response.status);
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch (error) {
        throw createInvalidResponseError(error);
      }

      return {
        data: parseClaudeUsageData(payload),
        rotatedSessionKey: parseRotatedSessionKey(response.headers)
      };
    }
  };
}

export function parseRotatedSessionKey(headers: Headers): string | null {
  const setCookieHeader = headers.get("set-cookie");
  if (!setCookieHeader) {
    return null;
  }

  const match = /(?:^|,\s*)sessionKey=([^;,]+)/.exec(setCookieHeader);
  return match?.[1] ?? null;
}

function parseClaudeUsageData(payload: unknown): ClaudeUsageData {
  if (!isRecord(payload)) {
    throw createInvalidResponseError();
  }

  return {
    fiveHour: parseRequiredLimit(payload.five_hour),
    sevenDay: parseRequiredLimit(payload.seven_day),
    sevenDaySonnet: parseNullableLimit(payload.seven_day_sonnet),
    sevenDayOpus: parseNullableLimit(payload.seven_day_opus),
    sevenDayOauthApps: parseNullableLimit(payload.seven_day_oauth_apps),
    sevenDayCowork: parseNullableLimit(payload.seven_day_cowork),
    other: parseOtherLimit(payload),
    extraUsage: parseNullableLimit(payload.extra_usage)
  };
}

function parseRequiredLimit(value: unknown): UsageLimit {
  const limit = parseNullableLimit(value);
  if (!limit) {
    throw createInvalidResponseError();
  }

  return limit;
}

function parseNullableLimit(value: unknown): UsageLimit | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (!isRecord(value) || typeof value.utilization !== "number") {
    throw createInvalidResponseError();
  }

  const resetsAt = value.resets_at;
  if (resetsAt !== null && resetsAt !== undefined && typeof resetsAt !== "string") {
    throw createInvalidResponseError();
  }

  return {
    utilization: value.utilization,
    resetsAt: resetsAt ?? null
  };
}

function parseOtherLimit(payload: ClaudeUsagePayload): UsageLimit | null {
  for (const [fieldName, value] of Object.entries(payload)) {
    if (KNOWN_LIMIT_FIELDS.has(fieldName)) {
      continue;
    }

    const limit = parseNullableLimit(value);
    if (limit) {
      return limit;
    }
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createAuthExpiredError(statusCode: 401 | 403): ClaudeUsageError {
  return {
    kind: "auth_expired",
    statusCode
  };
}

function createNetworkError(error: unknown): ClaudeUsageError {
  return {
    kind: "network_error",
    error
  };
}

function createInvalidResponseError(error?: unknown): ClaudeUsageError {
  return {
    kind: "invalid_response",
    error
  };
}
