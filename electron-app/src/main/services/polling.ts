import type {
  ClaudeAuthExpiredError,
  ClaudeInvalidResponseError,
  ClaudeNetworkError,
  ClaudeUsageClient,
  ClaudeUsageCredentials,
  ClaudeUsageResult
} from "./claudeUsage.js";

export interface UsagePollingAccountStore {
  readonly getActiveClaudeCredentials: () => UsagePollingCredentials | null;
  readonly markAuthExpired: (accountId: string) => void;
}

export interface UsagePollingCredentials extends ClaudeUsageCredentials {
  readonly accountId: string;
}

export interface UsagePollingSchedulerOptions {
  readonly accountStore: UsagePollingAccountStore;
  readonly claudeClient: ClaudeUsageClient;
  readonly emitUsageUpdated: (state: UsagePollingState) => void;
  readonly saveRotatedSessionKey: (accountId: string, sessionKey: string) => void;
  readonly now?: () => number;
}

export interface UsagePollingScheduler {
  readonly start: (accountId: string) => void;
  readonly refreshNow: () => Promise<void>;
  readonly switchAccount: (accountId: string) => void;
  readonly stop: () => void;
}

export type UsagePollingStatus = "ready" | "refreshing" | "updated" | "degraded" | "expired";

export interface UsagePollingState {
  readonly accountId: string | null;
  readonly status: UsagePollingStatus;
  readonly usage: ClaudeUsageResult["data"] | null;
  readonly lastUpdatedAt: string | null;
  readonly nextRefreshAt: string | null;
  readonly error: string | null;
}

type PollingTimer = ReturnType<typeof setTimeout>;
type ClaudeUsageError = ClaudeAuthExpiredError | ClaudeNetworkError | ClaudeInvalidResponseError;

const DEFAULT_POLL_INTERVAL_MS = 300_000;
const BACKOFF_BASE_INTERVAL_MS = 300_000;
const BACKOFF_MAX_INTERVAL_MS = 3_600_000;

export function createUsagePollingScheduler(options: UsagePollingSchedulerOptions): UsagePollingScheduler {
  const now = options.now ?? Date.now;
  let currentAccountId: string | null = null;
  let generation = 0;
  let regularTimer: PollingTimer | null = null;
  let resetTimer: PollingTimer | null = null;
  let consecutiveNetworkErrors = 0;
  let isStopped = true;
  let lastState: UsagePollingState = createState(null, "ready", null, null, null, null);

  const scheduler: UsagePollingScheduler = {
    start: (accountId: string): void => {
      beginAccount(accountId);
    },
    refreshNow: async (): Promise<void> => {
      if (!currentAccountId || isStopped) {
        return;
      }

      await fetchAndSchedule(generation);
    },
    switchAccount: (accountId: string): void => {
      beginAccount(accountId);
    },
    stop: (): void => {
      isStopped = true;
      generation += 1;
      clearScheduledTimers();
    }
  };

  return scheduler;

  function beginAccount(accountId: string): void {
    isStopped = false;
    currentAccountId = accountId;
    generation += 1;
    consecutiveNetworkErrors = 0;
    clearScheduledTimers();
    emit(createState(accountId, "ready", null, null, null, null));
    scheduleRegularFetch(0, generation);
  }

  async function fetchAndSchedule(fetchGeneration: number): Promise<void> {
    if (isStale(fetchGeneration) || !currentAccountId) {
      return;
    }

    const accountId = currentAccountId;
    const credentials = options.accountStore.getActiveClaudeCredentials();
    if (!credentials) {
      emit(createState(accountId, "degraded", null, null, null, "missing_credentials"));
      return;
    }

    emit(createState(accountId, "refreshing", lastState.usage, lastState.lastUpdatedAt, null, null));

    try {
      const result = await options.claudeClient.fetchUsage({
        orgId: credentials.orgId,
        sessionKey: credentials.sessionKey
      });

      if (isStale(fetchGeneration)) {
        return;
      }

      consecutiveNetworkErrors = 0;
      if (result.rotatedSessionKey) {
        options.saveRotatedSessionKey(accountId, result.rotatedSessionKey);
      }

      const fetchedAt = new Date(now()).toISOString();
      emit(createState(accountId, "updated", result.data, fetchedAt, toIso(now() + DEFAULT_POLL_INTERVAL_MS), null));
      scheduleRegularFetch(DEFAULT_POLL_INTERVAL_MS, fetchGeneration);
      scheduleResetFetch(result.data.fiveHour.resetsAt, fetchGeneration);
    } catch (error) {
      if (isStale(fetchGeneration)) {
        return;
      }

      handleFetchError(accountId, fetchGeneration, error);
    }
  }

  function handleFetchError(accountId: string, fetchGeneration: number, error: unknown): void {
    if (isAuthExpiredError(error)) {
      options.accountStore.markAuthExpired(accountId);
      isStopped = true;
      clearScheduledTimers();
      emit(createState(accountId, "expired", lastState.usage, lastState.lastUpdatedAt, null, "auth_expired"));
      return;
    }

    if (isNetworkError(error)) {
      consecutiveNetworkErrors += 1;
      const delayMs = getNetworkBackoffDelay(consecutiveNetworkErrors);
      emit(
        createState(
          accountId,
          "degraded",
          lastState.usage,
          lastState.lastUpdatedAt,
          toIso(now() + delayMs),
          "network_error"
        )
      );
      scheduleRegularFetch(delayMs, fetchGeneration);
      return;
    }

    emit(createState(accountId, "degraded", lastState.usage, lastState.lastUpdatedAt, null, "invalid_response"));
  }

  function scheduleRegularFetch(delayMs: number, fetchGeneration: number): void {
    clearRegularTimer();
    regularTimer = setTimeout(() => {
      regularTimer = null;
      void fetchAndSchedule(fetchGeneration);
    }, delayMs);
  }

  function scheduleResetFetch(resetsAt: string | null, fetchGeneration: number): void {
    clearResetTimer();
    if (!resetsAt) {
      return;
    }

    const resetTime = Date.parse(resetsAt);
    if (!Number.isFinite(resetTime)) {
      return;
    }

    const delayMs = resetTime - now();
    if (delayMs <= 0) {
      return;
    }

    resetTimer = setTimeout(() => {
      resetTimer = null;
      void fetchAndSchedule(fetchGeneration);
    }, delayMs);
  }

  function clearScheduledTimers(): void {
    clearRegularTimer();
    clearResetTimer();
  }

  function clearRegularTimer(): void {
    if (regularTimer) {
      clearTimeout(regularTimer);
      regularTimer = null;
    }
  }

  function clearResetTimer(): void {
    if (resetTimer) {
      clearTimeout(resetTimer);
      resetTimer = null;
    }
  }

  function emit(state: UsagePollingState): void {
    lastState = state;
    options.emitUsageUpdated(state);
  }

  function isStale(fetchGeneration: number): boolean {
    return isStopped || fetchGeneration !== generation;
  }
}

function getNetworkBackoffDelay(consecutiveNetworkErrors: number): number {
  const multiplier = 2 ** consecutiveNetworkErrors;
  return Math.min(BACKOFF_BASE_INTERVAL_MS * multiplier, BACKOFF_MAX_INTERVAL_MS);
}

function createState(
  accountId: string | null,
  status: UsagePollingStatus,
  usage: ClaudeUsageResult["data"] | null,
  lastUpdatedAt: string | null,
  nextRefreshAt: string | null,
  error: string | null
): UsagePollingState {
  return {
    accountId,
    status,
    usage,
    lastUpdatedAt,
    nextRefreshAt,
    error
  };
}

function toIso(timestampMs: number): string {
  return new Date(timestampMs).toISOString();
}

function isAuthExpiredError(error: unknown): error is ClaudeAuthExpiredError {
  return isClaudeError(error) && error.kind === "auth_expired";
}

function isNetworkError(error: unknown): error is ClaudeNetworkError {
  return isClaudeError(error) && error.kind === "network_error";
}

function isClaudeError(error: unknown): error is ClaudeUsageError {
  return typeof error === "object" && error !== null && "kind" in error;
}
