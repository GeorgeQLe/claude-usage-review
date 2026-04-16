import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { AccountId, AccountSummary } from "../../shared/types/accounts.js";
import type { ClaudeConnectionTestResult, UsageHistoryPoint, UsageHistoryResult } from "../../shared/types/ipc.js";
import type { ProviderCard } from "../../shared/types/provider.js";
import type { AppSettings } from "../../shared/types/settings.js";
import type { UsageState } from "../../shared/types/usage.js";

export interface RendererSnapshot {
  readonly usageState: UsageState;
  readonly settings: AppSettings;
  readonly accounts: readonly AccountSummary[];
  readonly usageHistory: UsageHistoryResult;
}

type SnapshotState =
  | { readonly status: "loading"; readonly snapshot: null; readonly error: null }
  | { readonly status: "ready"; readonly snapshot: RendererSnapshot; readonly error: null }
  | { readonly status: "error"; readonly snapshot: null; readonly error: string };

export type RendererSnapshotResource = SnapshotState & {
  readonly reload: () => Promise<void>;
  readonly refreshNow: () => Promise<void>;
  readonly addAccount: (label: string) => Promise<void>;
  readonly renameAccount: (accountId: AccountId, label: string) => Promise<void>;
  readonly removeAccount: (accountId: AccountId) => Promise<void>;
  readonly setActiveAccount: (accountId: AccountId) => Promise<void>;
  readonly saveClaudeCredentials: (accountId: AccountId, sessionKey: string, orgId: string) => Promise<void>;
  readonly testClaudeConnection: (sessionKey: string, orgId: string) => Promise<ClaudeConnectionTestResult>;
  readonly isRefreshing: boolean;
};

export function useRendererSnapshot(options: { readonly subscribeToUsage?: boolean } = {}): RendererSnapshotResource {
  const [state, setState] = useState<SnapshotState>({
    status: "loading",
    snapshot: null,
    error: null
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadUsageHistory = useCallback((accounts: readonly AccountSummary[]) => {
    const activeAccount = accounts.find((account) => account.isActive) ?? null;
    return window.claudeUsage.getUsageHistory(
      activeAccount ? { accountId: activeAccount.id, providerId: "claude" } : { providerId: "claude" }
    );
  }, []);

  const loadSnapshot = useCallback(async () => {
    const [usageState, settings, accounts] = await Promise.all([
      window.claudeUsage.getUsageState(),
      window.claudeUsage.getSettings(),
      window.claudeUsage.getAccounts()
    ]);
    const usageHistory = await loadUsageHistory(accounts);

    return { usageState, settings, accounts, usageHistory };
  }, [loadUsageHistory]);

  const updateAccounts = useCallback(async (accounts: readonly AccountSummary[]) => {
    const usageHistory = await loadUsageHistory(accounts);
    setState((current) =>
      current.status === "ready"
        ? {
            status: "ready",
            snapshot: {
              ...current.snapshot,
              accounts,
              usageHistory
            },
            error: null
          }
        : current
    );
  }, [loadUsageHistory]);

  const reloadUsageHistory = useCallback(
    async (accounts: readonly AccountSummary[]) => {
      const usageHistory = await loadUsageHistory(accounts);
      setState((current) =>
        current.status === "ready"
          ? {
              status: "ready",
              snapshot: {
                ...current.snapshot,
                usageHistory
              },
              error: null
            }
          : current
      );
    },
    [loadUsageHistory]
  );

  const reload = useCallback(async () => {
    try {
      setState({ status: "loading", snapshot: null, error: null });
      setState({ status: "ready", snapshot: await loadSnapshot(), error: null });
    } catch (error) {
      setState({ status: "error", snapshot: null, error: getErrorMessage(error) });
    }
  }, [loadSnapshot]);

  const refreshNow = useCallback(async () => {
    try {
      setIsRefreshing(true);
      const accounts = state.status === "ready" ? state.snapshot.accounts : [];
      const usageState = await window.claudeUsage.refreshNow();
      const usageHistory = await loadUsageHistory(accounts);
      setState((current) =>
        current.status === "ready"
          ? {
              status: "ready",
              snapshot: {
                ...current.snapshot,
                usageState,
                usageHistory
              },
              error: null
            }
          : current
      );
    } catch (error) {
      setState({ status: "error", snapshot: null, error: getErrorMessage(error) });
    } finally {
      setIsRefreshing(false);
    }
  }, [loadUsageHistory, state]);

  const addAccount = useCallback(
    async (label: string) => {
      await updateAccounts(await window.claudeUsage.addAccount(label));
    },
    [updateAccounts]
  );

  const renameAccount = useCallback(
    async (accountId: AccountId, label: string) => {
      await updateAccounts(await window.claudeUsage.renameAccount(accountId, label));
    },
    [updateAccounts]
  );

  const removeAccount = useCallback(
    async (accountId: AccountId) => {
      await updateAccounts(await window.claudeUsage.removeAccount(accountId));
    },
    [updateAccounts]
  );

  const setActiveAccount = useCallback(
    async (accountId: AccountId) => {
      await updateAccounts(await window.claudeUsage.setActiveAccount(accountId));
    },
    [updateAccounts]
  );

  const saveClaudeCredentials = useCallback(
    async (accountId: AccountId, sessionKey: string, orgId: string) => {
      await updateAccounts(await window.claudeUsage.saveClaudeCredentials(accountId, sessionKey, orgId));
    },
    [updateAccounts]
  );

  const testClaudeConnection = useCallback(
    (sessionKey: string, orgId: string) => window.claudeUsage.testClaudeConnection(sessionKey, orgId),
    []
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!options.subscribeToUsage) {
      return undefined;
    }

    return window.claudeUsage.subscribeUsageUpdated((usageState) => {
      let accounts: readonly AccountSummary[] = [];
      setState((current) => {
        if (current.status !== "ready") {
          return current;
        }

        accounts = current.snapshot.accounts;
        return {
          status: "ready",
          snapshot: {
            ...current.snapshot,
            usageState
          },
          error: null
        };
      });
      void reloadUsageHistory(accounts).catch((error) => {
        setState({ status: "error", snapshot: null, error: getErrorMessage(error) });
      });
    });
  }, [options.subscribeToUsage, reloadUsageHistory]);

  return useMemo(
    () => ({
      ...state,
      reload,
      refreshNow,
      addAccount,
      renameAccount,
      removeAccount,
      setActiveAccount,
      saveClaudeCredentials,
      testClaudeConnection,
      isRefreshing
    }),
    [
      addAccount,
      isRefreshing,
      refreshNow,
      reload,
      removeAccount,
      renameAccount,
      saveClaudeCredentials,
      setActiveAccount,
      state,
      testClaudeConnection
    ]
  );
}

export function WindowFrame({
  eyebrow,
  title,
  children,
  actions
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly children: ReactNode;
  readonly actions?: ReactNode;
}): React.JSX.Element {
  return (
    <main className="window-frame">
      <header className="window-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
        </div>
        {actions ? <div className="header-actions">{actions}</div> : null}
      </header>
      {children}
    </main>
  );
}

export function LoadingState({ label = "Loading usage state" }: { readonly label?: string }): React.JSX.Element {
  return (
    <main className="window-frame status-frame">
      <p className="eyebrow">ClaudeUsage</p>
      <h1>{label}</h1>
    </main>
  );
}

export function ErrorState({
  message,
  onRetry
}: {
  readonly message: string;
  readonly onRetry: () => void;
}): React.JSX.Element {
  return (
    <main className="window-frame status-frame">
      <p className="eyebrow">ClaudeUsage</p>
      <h1>Usage state unavailable</h1>
      <p className="muted">{message}</p>
      <button type="button" onClick={onRetry}>
        Try again
      </button>
    </main>
  );
}

export function WarningBanner({ warning }: { readonly warning: string | null }): React.JSX.Element | null {
  if (!warning) {
    return null;
  }

  return <p className="warning-banner">{warning}</p>;
}

export function ProviderList({
  providers,
  activeAccount,
  usageHistory
}: {
  readonly providers: readonly ProviderCard[];
  readonly activeAccount?: AccountSummary | null;
  readonly usageHistory: UsageHistoryResult;
}): React.JSX.Element {
  return (
    <section className="provider-list" aria-label="Providers">
      {providers.map((provider) =>
        provider.providerId === "claude" ? (
          <ClaudeUsageCard
            activeAccount={activeAccount ?? null}
            key={provider.providerId}
            provider={provider}
            usageHistory={usageHistory}
          />
        ) : (
          <ProviderPlaceholderCard key={provider.providerId} provider={provider} />
        )
      )}
    </section>
  );
}

export function ClaudeUsageCard({
  provider,
  activeAccount,
  usageHistory,
  compact = false
}: {
  readonly provider: ProviderCard;
  readonly activeAccount?: AccountSummary | null;
  readonly usageHistory: UsageHistoryResult;
  readonly compact?: boolean;
}): React.JSX.Element {
  return (
    <article className={`provider-card claude-usage-card${compact ? " claude-usage-card-compact" : ""}`}>
      <div className="provider-title-row">
        <div>
          <h2>{provider.displayName}</h2>
          <p className="muted">{formatProviderStatus(provider)}</p>
        </div>
        <StatusPill tone={getProviderTone(provider)}>{formatProviderPill(provider)}</StatusPill>
      </div>
      <div className="provider-copy">
        <p className="provider-headline">{provider.headline}</p>
        {provider.detailText ? <p className="muted">{provider.detailText}</p> : null}
      </div>
      <div className="usage-meter-stack">
        <UsageMeter label="Five-hour usage" value={provider.sessionUtilization} />
        <UsageMeter label="Weekly usage" value={provider.weeklyUtilization} />
      </div>
      <UsageHistoryPanel history={usageHistory} />
      <div className="summary-grid">
        <Metric label="Reset" value={formatDateTime(provider.resetAt)} />
        <Metric label="Updated" value={formatDateTime(provider.lastUpdatedAt)} />
        <Metric label="Account" value={activeAccount ? activeAccount.label : "No account"} />
        <Metric label="Auth" value={activeAccount ? formatToken(activeAccount.authStatus) : "Missing Credentials"} />
      </div>
    </article>
  );
}

export function ProviderPlaceholderCard({ provider }: { readonly provider: ProviderCard }): React.JSX.Element {
  return (
    <article className="provider-card provider-card-compact">
      <div className="provider-title-row">
        <div>
          <h2>{provider.displayName}</h2>
          <p className="muted">{formatProviderStatus(provider)}</p>
        </div>
        <StatusPill tone={provider.enabled ? "active" : "muted"}>{provider.enabled ? "On" : "Later"}</StatusPill>
      </div>
      <p className="provider-headline">{provider.headline}</p>
    </article>
  );
}

export function AccountList({ accounts }: { readonly accounts: readonly AccountSummary[] }): React.JSX.Element {
  if (accounts.length === 0) {
    return <p className="muted">No local accounts yet.</p>;
  }

  return (
    <section className="list-section" aria-label="Accounts">
      {accounts.map((account) => (
        <article className="list-row" key={account.id}>
          <div>
            <h2>{account.label}</h2>
            <p className="muted">{formatAccountStatus(account)}</p>
          </div>
          <StatusPill tone={account.isActive ? "active" : account.authStatus === "expired" ? "warning" : "muted"}>
            {account.isActive ? "Active" : "Saved"}
          </StatusPill>
        </article>
      ))}
    </section>
  );
}

export function AccountManager({
  accounts,
  onAdd,
  onRename,
  onRemove,
  onSwitch
}: {
  readonly accounts: readonly AccountSummary[];
  readonly onAdd: (label: string) => Promise<void>;
  readonly onRename: (accountId: AccountId, label: string) => Promise<void>;
  readonly onRemove: (accountId: AccountId) => Promise<void>;
  readonly onSwitch: (accountId: AccountId) => Promise<void>;
}): React.JSX.Element {
  const [newLabel, setNewLabel] = useState("");
  const [renameValues, setRenameValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const addAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const label = newLabel.trim();
    if (!label) {
      setStatus("Enter an account name.");
      return;
    }

    await runAccountAction(`add:${label}`, async () => {
      await onAdd(label);
      setNewLabel("");
      setStatus("Account added.");
    });
  };

  const runAccountAction = async (key: string, action: () => Promise<void>) => {
    try {
      setBusyAction(key);
      await action();
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <section className="account-manager" aria-label="Claude accounts">
      <form className="inline-form" onSubmit={addAccount}>
        <label>
          Account name
          <input
            autoComplete="off"
            name="account-label"
            onChange={(event) => setNewLabel(event.target.value)}
            placeholder="Work"
            type="text"
            value={newLabel}
          />
        </label>
        <button disabled={busyAction !== null || !newLabel.trim()} type="submit">
          Add account
        </button>
      </form>
      {accounts.length === 0 ? <p className="muted">No local accounts yet.</p> : null}
      <div className="account-actions-list">
        {accounts.map((account) => {
          const renameValue = renameValues[account.id] ?? account.label;
          return (
            <article className="account-action-row" key={account.id}>
              <div className="account-action-main">
                <label>
                  {account.label}
                  <input
                    autoComplete="off"
                    name={`rename-${account.id}`}
                    onChange={(event) =>
                      setRenameValues((current) => ({
                        ...current,
                        [account.id]: event.target.value
                      }))
                    }
                    type="text"
                    value={renameValue}
                  />
                </label>
                <p className="muted">{formatAccountStatus(account)}</p>
              </div>
              <div className="account-row-actions">
                <button
                  disabled={busyAction !== null || renameValue.trim() === "" || renameValue.trim() === account.label}
                  onClick={() =>
                    void runAccountAction(`rename:${account.id}`, async () => {
                      await onRename(account.id, renameValue.trim());
                      setStatus("Account renamed.");
                    })
                  }
                  type="button"
                >
                  Rename
                </button>
                <button
                  disabled={busyAction !== null || account.isActive}
                  onClick={() =>
                    void runAccountAction(`switch:${account.id}`, async () => {
                      await onSwitch(account.id);
                      setStatus("Active account changed.");
                    })
                  }
                  type="button"
                >
                  Use
                </button>
                <button
                  disabled={busyAction !== null || accounts.length <= 1}
                  onClick={() =>
                    void runAccountAction(`remove:${account.id}`, async () => {
                      await onRemove(account.id);
                      setStatus("Account removed.");
                    })
                  }
                  type="button"
                >
                  Remove
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {status ? <p className="form-status">{status}</p> : null}
    </section>
  );
}

export function SettingsSummary({ settings }: { readonly settings: AppSettings }): React.JSX.Element {
  return (
    <section className="summary-grid" aria-label="Settings">
      <Metric label="Launch at login" value={settings.launchAtLogin ? "On" : "Off"} />
      <Metric label="Time" value={formatToken(settings.timeDisplay)} />
      <Metric label="Pace" value={formatToken(settings.paceTheme)} />
      <Metric label="Overlay" value={settings.overlay.enabled ? formatToken(settings.overlay.layout) : "Off"} />
    </section>
  );
}

export function ClaudeCredentialForm({
  activeAccount,
  onSaved,
  onSaveCredentials,
  onTestConnection
}: {
  readonly activeAccount: AccountSummary | null;
  readonly onSaved?: () => Promise<void>;
  readonly onSaveCredentials?: (accountId: AccountId, sessionKey: string, orgId: string) => Promise<void>;
  readonly onTestConnection?: (sessionKey: string, orgId: string) => Promise<ClaudeConnectionTestResult>;
}): React.JSX.Element {
  const [sessionKey, setSessionKey] = useState("");
  const [orgId, setOrgId] = useState(activeAccount?.orgId ?? "");
  const [status, setStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    setSessionKey("");
    setOrgId(activeAccount?.orgId ?? "");
    setStatus(null);
  }, [activeAccount?.id]);

  const saveCredentials = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!activeAccount) {
      setStatus("Create an account before adding credentials.");
      return;
    }

    try {
      setIsSaving(true);
      await (onSaveCredentials ?? window.claudeUsage.saveClaudeCredentials)(activeAccount.id, sessionKey, orgId);
      setSessionKey("");
      setStatus("Credentials saved for this local account.");
      await onSaved?.();
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const testConnection = async () => {
    try {
      setIsTesting(true);
      const result = await (onTestConnection ?? window.claudeUsage.testClaudeConnection)(sessionKey, orgId);
      setSessionKey("");
      setStatus(result.message);
    } catch (error) {
      setSessionKey("");
      setStatus(getErrorMessage(error));
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <form className="credential-form" onSubmit={saveCredentials}>
      <label>
        Session key
        <input
          autoComplete="off"
          name="session-key"
          onChange={(event) => setSessionKey(event.target.value)}
          placeholder="sk-ant-sid01..."
          type="password"
          value={sessionKey}
        />
      </label>
      <label>
        Organization ID
        <input
          autoComplete="off"
          name="org-id"
          onChange={(event) => setOrgId(event.target.value)}
          placeholder="org_..."
          type="text"
          value={orgId}
        />
      </label>
      <p className="muted">Session keys are never displayed after saving or testing.</p>
      <div className="button-row">
        <button disabled={isSaving || isTesting || !activeAccount || !sessionKey || !orgId} type="submit">
          {isSaving ? "Saving" : "Save credentials"}
        </button>
        <button
          disabled={isSaving || isTesting || !sessionKey || !orgId}
          onClick={() => void testConnection()}
          type="button"
        >
          {isTesting ? "Testing" : "Test connection"}
        </button>
      </div>
      {status ? <p className="form-status">{status}</p> : null}
    </form>
  );
}

export function CredentialPlaceholder({
  activeAccount,
  onSaved
}: {
  readonly activeAccount: AccountSummary | null;
  readonly onSaved: () => Promise<void>;
}): React.JSX.Element {
  return <ClaudeCredentialForm activeAccount={activeAccount} onSaved={onSaved} />;
}

export function StatusPill({
  children,
  tone
}: {
  readonly children: ReactNode;
  readonly tone: "active" | "muted" | "warning";
}): React.JSX.Element {
  return <span className={`status-pill status-pill-${tone}`}>{children}</span>;
}

export function getClaudeProvider(usageState: UsageState): ProviderCard | null {
  return usageState.providers.find((provider) => provider.providerId === "claude") ?? null;
}

function UsageMeter({ label, value }: { readonly label: string; readonly value: number | null }): React.JSX.Element {
  const width = formatMeterWidth(value);

  return (
    <div className="usage-meter">
      <div className="usage-meter-label">
        <span>{label}</span>
        <strong>{formatPercent(value)}</strong>
      </div>
      <div className="usage-meter-track" aria-hidden="true">
        <div className="usage-meter-fill" style={{ width }} />
      </div>
    </div>
  );
}

function UsageHistoryPanel({ history }: { readonly history: UsageHistoryResult }): React.JSX.Element {
  const latestPoint = history.points.at(-1) ?? null;

  return (
    <section className="usage-history" aria-label="Usage history">
      <div className="usage-history-header">
        <h3>History</h3>
        <span>{latestPoint ? `Updated ${formatDateTime(latestPoint.capturedAt)}` : "Waiting for history"}</span>
      </div>
      {history.points.length > 0 ? (
        <div className="sparkline-grid">
          <UsageSparkline label="Session" points={history.points} valueKey="sessionUtilization" />
          <UsageSparkline label="Weekly" points={history.points} valueKey="weeklyUtilization" />
        </div>
      ) : (
        <p className="muted">History starts after Claude refreshes.</p>
      )}
    </section>
  );
}

function UsageSparkline({
  label,
  points,
  valueKey
}: {
  readonly label: string;
  readonly points: readonly UsageHistoryPoint[];
  readonly valueKey: "sessionUtilization" | "weeklyUtilization";
}): React.JSX.Element {
  const values = points
    .map((point) => point[valueKey])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const latestValue = values.at(-1) ?? null;
  const polylinePoints = formatSparklinePoints(values);

  return (
    <div className="sparkline" aria-label={`${label} history`}>
      <div className="sparkline-label">
        <span>{label}</span>
        <strong>{formatPercent(latestValue)}</strong>
      </div>
      <svg aria-hidden="true" focusable="false" preserveAspectRatio="none" viewBox="0 0 100 36">
        <line className="sparkline-baseline" x1="0" x2="100" y1="35" y2="35" />
        {polylinePoints ? <polyline className="sparkline-line" points={polylinePoints} /> : null}
      </svg>
    </div>
  );
}

function Metric({ label, value }: { readonly label: string; readonly value: string }): React.JSX.Element {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function getProviderTone(provider: ProviderCard): "active" | "muted" | "warning" {
  if (provider.status === "expired" || provider.status === "degraded" || provider.status === "missing_configuration") {
    return "warning";
  }

  return provider.enabled ? "active" : "muted";
}

function formatProviderPill(provider: ProviderCard): string {
  if (provider.status === "expired") {
    return "Expired";
  }

  if (provider.status === "degraded") {
    return "Degraded";
  }

  if (provider.status === "missing_configuration") {
    return "Setup";
  }

  return provider.enabled ? "Tracking" : "Off";
}

function formatProviderStatus(provider: ProviderCard): string {
  return `${formatToken(provider.status)} · ${formatToken(provider.confidence)}`;
}

function formatAccountStatus(account: AccountSummary): string {
  const orgLabel = account.orgId ? `Org ${account.orgId}` : "No organization";
  return `${formatToken(account.authStatus)} · ${orgLabel}`;
}

function formatPercent(value: number | null): string {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : "Pending";
}

function formatMeterWidth(value: number | null): string {
  if (typeof value !== "number") {
    return "0%";
  }

  return `${Math.max(0, Math.min(100, Math.round(value * 100)))}%`;
}

function formatSparklinePoints(values: readonly number[]): string {
  if (values.length === 0) {
    return "";
  }

  if (values.length === 1) {
    const y = formatSparklineY(values[0]);
    return `0,${y} 100,${y}`;
  }

  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      return `${roundSparklineCoordinate(x)},${formatSparklineY(value)}`;
    })
    .join(" ");
}

function formatSparklineY(value: number): string {
  return roundSparklineCoordinate(35 - Math.max(0, Math.min(1, value)) * 34);
}

function roundSparklineCoordinate(value: number): string {
  return value.toFixed(2).replace(/\.?0+$/u, "");
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "Pending";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Pending";
  }

  return parsed.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatToken(value: string): string {
  return value
    .split(/[-_]/u)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected renderer error.";
}
