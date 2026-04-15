import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { AccountSummary } from "../../shared/types/accounts.js";
import type { ProviderCard } from "../../shared/types/provider.js";
import type { AppSettings } from "../../shared/types/settings.js";
import type { UsageState } from "../../shared/types/usage.js";

export interface RendererSnapshot {
  readonly usageState: UsageState;
  readonly settings: AppSettings;
  readonly accounts: readonly AccountSummary[];
}

type SnapshotState =
  | { readonly status: "loading"; readonly snapshot: null; readonly error: null }
  | { readonly status: "ready"; readonly snapshot: RendererSnapshot; readonly error: null }
  | { readonly status: "error"; readonly snapshot: null; readonly error: string };

export type RendererSnapshotResource = SnapshotState & {
  readonly reload: () => Promise<void>;
  readonly refreshNow: () => Promise<void>;
  readonly isRefreshing: boolean;
};

export function useRendererSnapshot(options: { readonly subscribeToUsage?: boolean } = {}): RendererSnapshotResource {
  const [state, setState] = useState<SnapshotState>({
    status: "loading",
    snapshot: null,
    error: null
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadSnapshot = useCallback(async () => {
    const [usageState, settings, accounts] = await Promise.all([
      window.claudeUsage.getUsageState(),
      window.claudeUsage.getSettings(),
      window.claudeUsage.getAccounts()
    ]);

    return { usageState, settings, accounts };
  }, []);

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
      const usageState = await window.claudeUsage.refreshNow();
      setState((current) =>
        current.status === "ready"
          ? {
              status: "ready",
              snapshot: {
                ...current.snapshot,
                usageState
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
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!options.subscribeToUsage) {
      return undefined;
    }

    return window.claudeUsage.subscribeUsageUpdated((usageState) => {
      setState((current) =>
        current.status === "ready"
          ? {
              status: "ready",
              snapshot: {
                ...current.snapshot,
                usageState
              },
              error: null
            }
          : current
      );
    });
  }, [options.subscribeToUsage]);

  return useMemo(
    () => ({
      ...state,
      reload,
      refreshNow,
      isRefreshing
    }),
    [isRefreshing, refreshNow, reload, state]
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

export function ProviderList({ providers }: { readonly providers: readonly ProviderCard[] }): React.JSX.Element {
  return (
    <section className="provider-list" aria-label="Providers">
      {providers.map((provider) => (
        <article className="provider-card" key={provider.providerId}>
          <div className="provider-title-row">
            <div>
              <h2>{provider.displayName}</h2>
              <p className="muted">{formatProviderStatus(provider)}</p>
            </div>
            <StatusPill tone={provider.enabled ? "active" : "muted"}>{provider.enabled ? "On" : "Off"}</StatusPill>
          </div>
          <p className="provider-headline">{provider.headline}</p>
          <div className="meter-grid">
            <Metric label="Session" value={formatPercent(provider.sessionUtilization)} />
            <Metric label="Weekly" value={formatPercent(provider.weeklyUtilization)} />
            <Metric label="Today" value={formatNumber(provider.dailyRequestCount)} />
          </div>
        </article>
      ))}
    </section>
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
          <StatusPill tone={account.isActive ? "active" : "muted"}>{account.isActive ? "Active" : "Saved"}</StatusPill>
        </article>
      ))}
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

export function CredentialPlaceholder({
  activeAccount,
  onSaved
}: {
  readonly activeAccount: AccountSummary | null;
  readonly onSaved: () => Promise<void>;
}): React.JSX.Element {
  const [sessionKey, setSessionKey] = useState("");
  const [orgId, setOrgId] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const saveCredentials = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!activeAccount) {
      setStatus("Create an account before adding credentials.");
      return;
    }

    try {
      setIsSaving(true);
      await window.claudeUsage.saveClaudeCredentials(activeAccount.id, sessionKey, orgId);
      setSessionKey("");
      setStatus("Credentials saved for this local account.");
      await onSaved();
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setIsSaving(false);
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
      <p className="muted">Session keys are never displayed after saving.</p>
      <button disabled={isSaving || !sessionKey || !orgId} type="submit">
        {isSaving ? "Saving" : "Save credentials"}
      </button>
      {status ? <p className="form-status">{status}</p> : null}
    </form>
  );
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

function Metric({ label, value }: { readonly label: string; readonly value: string }): React.JSX.Element {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
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

function formatNumber(value: number | null): string {
  return typeof value === "number" ? value.toLocaleString() : "Pending";
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
