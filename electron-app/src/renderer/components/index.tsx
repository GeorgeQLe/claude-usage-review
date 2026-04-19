import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { AccountId, AccountSummary } from "../../shared/types/accounts.js";
import type {
  ClaudeConnectionTestResult,
  GitHubContributionDay,
  GitHubHeatmapResult,
  SaveGitHubSettingsPayload,
  UsageHistoryPoint,
  UsageHistoryResult,
  WrapperSetupResult,
  WrapperVerificationResult
} from "../../shared/types/ipc.js";
import type { ProviderCard } from "../../shared/types/provider.js";
import type { AppSettings, AppSettingsPatch } from "../../shared/types/settings.js";
import type { UsageState } from "../../shared/types/usage.js";
import { mergeAppSettings } from "../../shared/settings/defaults.js";

export interface RendererSnapshot {
  readonly usageState: UsageState;
  readonly settings: AppSettings;
  readonly accounts: readonly AccountSummary[];
  readonly usageHistory: UsageHistoryResult;
  readonly githubHeatmap: GitHubHeatmapResult;
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
  readonly saveGitHubSettings: (payload: SaveGitHubSettingsPayload) => Promise<void>;
  readonly refreshGitHubHeatmap: () => Promise<void>;
  readonly updateSettings: (patch: AppSettingsPatch) => Promise<void>;
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
    const [usageState, settings, accounts, githubHeatmap] = await Promise.all([
      window.claudeUsage.getUsageState(),
      window.claudeUsage.getSettings(),
      window.claudeUsage.getAccounts(),
      window.claudeUsage.getGitHubHeatmap()
    ]);
    const usageHistory = await loadUsageHistory(accounts);

    return { usageState, settings, accounts, usageHistory, githubHeatmap };
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

  const saveGitHubSettings = useCallback(async (payload: SaveGitHubSettingsPayload) => {
    const githubHeatmap = await window.claudeUsage.saveGitHubSettings(payload);
    setState((current) =>
      current.status === "ready"
        ? {
            status: "ready",
            snapshot: {
              ...current.snapshot,
              githubHeatmap
            },
            error: null
          }
        : current
    );
  }, []);

  const refreshGitHubHeatmap = useCallback(async () => {
    const githubHeatmap = await window.claudeUsage.refreshGitHubHeatmap();
    setState((current) =>
      current.status === "ready"
        ? {
            status: "ready",
            snapshot: {
              ...current.snapshot,
              githubHeatmap
            },
            error: null
          }
        : current
    );
  }, []);

  const updateSettings = useCallback(async (patch: AppSettingsPatch) => {
    const settings = await window.claudeUsage.updateSettings(patch);
    setState((current) =>
      current.status === "ready"
        ? {
            status: "ready",
            snapshot: {
              ...current.snapshot,
              settings
            },
            error: null
          }
        : current
    );
  }, []);

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
      saveGitHubSettings,
      refreshGitHubHeatmap,
      updateSettings,
      isRefreshing
    }),
    [
      addAccount,
      isRefreshing,
      refreshNow,
      reload,
      removeAccount,
      renameAccount,
      refreshGitHubHeatmap,
      saveClaudeCredentials,
      saveGitHubSettings,
      setActiveAccount,
      state,
      testClaudeConnection,
      updateSettings
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
  usageHistory,
  githubHeatmap
}: {
  readonly providers: readonly ProviderCard[];
  readonly activeAccount?: AccountSummary | null;
  readonly usageHistory: UsageHistoryResult;
  readonly githubHeatmap: GitHubHeatmapResult;
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
          <PassiveProviderCard key={provider.providerId} provider={provider} />
        )
      )}
      <GitHubHeatmapPanel heatmap={githubHeatmap} />
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

export function PassiveProviderCard({ provider }: { readonly provider: ProviderCard }): React.JSX.Element {
  return (
    <article className="provider-card provider-card-compact">
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
        <p className="muted">{provider.confidenceExplanation}</p>
      </div>
      <div className="summary-grid">
        <Metric label="Requests" value={formatDailyRequests(provider.dailyRequestCount)} />
        <Metric label="Rate" value={formatRequestsPerMinute(provider.requestsPerMinute)} />
        <Metric label="Updated" value={formatDateTime(provider.lastUpdatedAt)} />
        <Metric label="Mode" value={formatToken(provider.adapterMode)} />
      </div>
      {provider.actions.length > 0 ? (
        <div className="inline-actions">
          {provider.actions.includes("refresh") ? (
            <button onClick={() => void window.claudeUsage.runProviderDetection(provider.providerId)} type="button">
              Refresh {provider.displayName}
            </button>
          ) : null}
          {provider.actions.includes("diagnostics") ? (
            <button onClick={() => void window.claudeUsage.getProviderDiagnostics(provider.providerId)} type="button">
              {provider.displayName} diagnostics
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export const ProviderPlaceholderCard = PassiveProviderCard;

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
      <Metric label="Weekly color" value={formatToken(settings.weeklyColorMode)} />
      <Metric label="Overlay" value={settings.overlay.enabled ? formatToken(settings.overlay.layout) : "Off"} />
      <Metric label="Notifications" value={settings.notifications.enabled ? "On" : "Off"} />
    </section>
  );
}

export function SettingsControls({
  providerCards = [],
  settings,
  onUpdateSettings
}: {
  readonly providerCards?: readonly ProviderCard[];
  readonly settings: AppSettings;
  readonly onUpdateSettings: (patch: AppSettingsPatch) => Promise<void>;
}): React.JSX.Element {
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [status, setStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const updateDraft = (patch: AppSettingsPatch) => {
    setDraft((current) => mergeAppSettings(current, patch));
  };

  const saveSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      setIsSaving(true);
      await onUpdateSettings(draft);
      setStatus("Settings saved.");
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form className="settings-form" onSubmit={saveSettings}>
      <section className="settings-section" aria-label="Display">
        <h3>Display</h3>
        <div className="form-grid">
          <label>
            Reset label
            <select
              name="time-display"
              onChange={(event) => updateDraft({ timeDisplay: event.target.value as AppSettings["timeDisplay"] })}
              value={draft.timeDisplay}
            >
              <option value="countdown">Countdown</option>
              <option value="reset-time">Clock time</option>
            </select>
          </label>
          <label>
            Pace theme
            <select
              name="pace-theme"
              onChange={(event) => updateDraft({ paceTheme: event.target.value as AppSettings["paceTheme"] })}
              value={draft.paceTheme}
            >
              <option value="balanced">Balanced</option>
              <option value="strict">Strict</option>
              <option value="relaxed">Relaxed</option>
            </select>
          </label>
          <label>
            Weekly color
            <select
              name="weekly-color-mode"
              onChange={(event) =>
                updateDraft({ weeklyColorMode: event.target.value as AppSettings["weeklyColorMode"] })
              }
              value={draft.weeklyColorMode}
            >
              <option value="pace-aware">Pace aware</option>
              <option value="raw-percentage">Raw percentage</option>
            </select>
          </label>
        </div>
      </section>
      <section className="settings-section" aria-label="Launch and overlay">
        <h3>Launch and overlay</h3>
        <label className="checkbox-label">
          <input
            checked={draft.launchAtLogin}
            name="launch-at-login"
            onChange={(event) => updateDraft({ launchAtLogin: event.target.checked })}
            type="checkbox"
          />
          Open at login
        </label>
        <label className="checkbox-label">
          <input
            checked={draft.overlay.enabled}
            name="overlay-enabled"
            onChange={(event) => updateDraft({ overlay: { enabled: event.target.checked } })}
            type="checkbox"
          />
          Enable overlay by default
        </label>
        <div className="form-grid">
          <label>
            Overlay layout
            <select
              name="overlay-layout"
              onChange={(event) => updateDraft({ overlay: { layout: event.target.value as AppSettings["overlay"]["layout"] } })}
              value={draft.overlay.layout}
            >
              <option value="compact">Compact</option>
              <option value="minimal">Minimal</option>
              <option value="sidebar">Sidebar</option>
            </select>
          </label>
          <label>
            Overlay opacity
            <input
              max="1"
              min="0.2"
              name="overlay-opacity"
              onChange={(event) => updateDraft({ overlay: { opacity: Number(event.target.value) } })}
              step="0.05"
              type="number"
              value={draft.overlay.opacity}
            />
          </label>
        </div>
      </section>
      <section className="settings-section" aria-label="Providers">
        <h3>Providers</h3>
        <p className="muted">Codex and Gemini use local provider status only.</p>
        <div className="form-grid">
          <ProviderSettingsField
            provider={findProviderCard(providerCards, "codex")}
            settings={draft.providers.codex}
            label="Codex"
            name="codex"
            onChange={(patch) => updateDraft({ providers: { codex: patch } })}
          />
          <ProviderSettingsField
            provider={findProviderCard(providerCards, "gemini")}
            settings={draft.providers.gemini}
            label="Gemini"
            name="gemini"
            onChange={(patch) => updateDraft({ providers: { gemini: patch } })}
          />
        </div>
      </section>
      <section className="settings-section" aria-label="Migration">
        <h3>Migration</h3>
        <label className="checkbox-label">
          <input
            checked={draft.migration.swiftAppImport}
            name="swift-migration-prompt"
            onChange={(event) => updateDraft({ migration: { swiftAppImport: event.target.checked } })}
            type="checkbox"
          />
          Offer Swift app import
        </label>
        <label className="checkbox-label">
          <input
            checked={draft.migration.providerImport}
            name="provider-migration-prompt"
            onChange={(event) => updateDraft({ migration: { providerImport: event.target.checked } })}
            type="checkbox"
          />
          Offer provider import
        </label>
      </section>
      <section className="settings-section" aria-label="Notifications">
        <h3>Notifications</h3>
        <div className="checkbox-grid">
          <NotificationCheckbox
            checked={draft.notifications.enabled}
            label="Enable notifications"
            name="notifications-enabled"
            onChange={(enabled) => updateDraft({ notifications: { enabled } })}
          />
          <NotificationCheckbox
            checked={draft.notifications.sessionReset}
            label="Session reset"
            name="session-reset-notification"
            onChange={(sessionReset) => updateDraft({ notifications: { sessionReset } })}
          />
          <NotificationCheckbox
            checked={draft.notifications.weeklyReset}
            label="Weekly reset"
            name="weekly-reset-notification"
            onChange={(weeklyReset) => updateDraft({ notifications: { weeklyReset } })}
          />
          <NotificationCheckbox
            checked={draft.notifications.authExpired}
            label="Auth expired"
            name="auth-expired-notification"
            onChange={(authExpired) => updateDraft({ notifications: { authExpired } })}
          />
          <NotificationCheckbox
            checked={draft.notifications.providerDegraded}
            label="Provider degraded"
            name="provider-degraded-notification"
            onChange={(providerDegraded) => updateDraft({ notifications: { providerDegraded } })}
          />
          <NotificationCheckbox
            checked={draft.notifications.thresholdWarnings}
            label="Threshold warnings"
            name="threshold-warning-notification"
            onChange={(thresholdWarnings) => updateDraft({ notifications: { thresholdWarnings } })}
          />
        </div>
        <div className="form-grid">
          <label>
            Session warning %
            <input
              max="100"
              min="1"
              name="session-warning-percent"
              onChange={(event) =>
                updateDraft({ notifications: { sessionWarningPercent: Number(event.target.value) } })
              }
              type="number"
              value={draft.notifications.sessionWarningPercent}
            />
          </label>
          <label>
            Weekly warning %
            <input
              max="100"
              min="1"
              name="weekly-warning-percent"
              onChange={(event) => updateDraft({ notifications: { weeklyWarningPercent: Number(event.target.value) } })}
              type="number"
              value={draft.notifications.weeklyWarningPercent}
            />
          </label>
        </div>
      </section>
      <section className="settings-section" aria-label="Onboarding">
        <h3>Onboarding</h3>
        <div className="checkbox-grid">
          <NotificationCheckbox
            checked={draft.onboarding.completed}
            label="Setup complete"
            name="onboarding-completed"
            onChange={(completed) => updateDraft({ onboarding: { completed, skipped: completed ? false : draft.onboarding.skipped } })}
          />
          <NotificationCheckbox
            checked={draft.onboarding.skipped}
            label="Setup skipped"
            name="onboarding-skipped"
            onChange={(skipped) => updateDraft({ onboarding: { skipped, completed: skipped ? false : draft.onboarding.completed } })}
          />
        </div>
      </section>
      <div className="button-row">
        <button disabled={isSaving} type="submit">
          {isSaving ? "Saving" : "Save settings"}
        </button>
      </div>
      {status ? <p className="form-status">{status}</p> : null}
    </form>
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

export function GitHubSettingsForm({
  heatmap,
  onRefresh,
  onSave
}: {
  readonly heatmap: GitHubHeatmapResult;
  readonly onRefresh: () => Promise<void>;
  readonly onSave: (payload: SaveGitHubSettingsPayload) => Promise<void>;
}): React.JSX.Element {
  const [enabled, setEnabled] = useState(heatmap.enabled);
  const [username, setUsername] = useState(heatmap.username ?? "");
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    setEnabled(heatmap.enabled);
    setUsername(heatmap.username ?? "");
    setToken("");
  }, [heatmap.enabled, heatmap.username]);

  const saveSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      setIsSaving(true);
      await onSave({
        enabled,
        username: username.trim() ? username.trim() : null,
        token: token.trim() ? token.trim() : undefined
      });
      setToken("");
      setStatus("GitHub settings saved.");
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const refreshHeatmap = async () => {
    try {
      setIsRefreshing(true);
      await onRefresh();
      setStatus("GitHub contributions refreshed.");
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <form className="credential-form" onSubmit={saveSettings}>
      <label className="checkbox-label">
        <input checked={enabled} onChange={(event) => setEnabled(event.target.checked)} type="checkbox" />
        Enable GitHub heatmap
      </label>
      <label>
        GitHub username
        <input
          autoComplete="off"
          name="github-username"
          onChange={(event) => setUsername(event.target.value)}
          placeholder="octocat"
          type="text"
          value={username}
        />
      </label>
      <label>
        GitHub token
        <input
          autoComplete="off"
          name="github-token"
          onChange={(event) => setToken(event.target.value)}
          placeholder={heatmap.configured ? "Saved token" : "ghp_..."}
          type="password"
          value={token}
        />
      </label>
      <p className="muted">Tokens are write-only and never rendered after saving.</p>
      <div className="button-row">
        <button disabled={isSaving || isRefreshing || (enabled && !username.trim())} type="submit">
          {isSaving ? "Saving" : "Save GitHub"}
        </button>
        <button disabled={isSaving || isRefreshing || !heatmap.configured} onClick={() => void refreshHeatmap()} type="button">
          {isRefreshing ? "Refreshing" : "Refresh GitHub"}
        </button>
      </div>
      <GitHubHeatmapStatusText heatmap={heatmap} />
      {status ? <p className="form-status">{status}</p> : null}
    </form>
  );
}

export function GitHubHeatmapPanel({ heatmap }: { readonly heatmap: GitHubHeatmapResult }): React.JSX.Element {
  const latestDay = heatmap.weeks.flatMap((week) => week.contributionDays).at(-1) ?? null;

  return (
    <article className="provider-card github-card">
      <div className="provider-title-row">
        <div>
          <h2>GitHub Contributions</h2>
          <p className="muted">{formatGitHubStatus(heatmap)}</p>
        </div>
        <StatusPill tone={heatmap.status === "ready" ? "active" : heatmap.status === "error" || heatmap.status === "auth_expired" ? "warning" : "muted"}>
          {formatToken(heatmap.status)}
        </StatusPill>
      </div>
      {heatmap.status === "ready" && heatmap.weeks.length > 0 ? (
        <>
          <div className="github-heatmap" aria-label="GitHub contribution heatmap">
            {heatmap.weeks.map((week, weekIndex) => (
              <div className="github-week" key={`${weekIndex}-${week.contributionDays[0]?.date ?? "empty"}`}>
                {week.contributionDays.map((day) => (
                  <GitHubHeatmapCell day={day} key={day.date} />
                ))}
              </div>
            ))}
          </div>
          <p className="muted">
            {heatmap.totalContributions} contributions{latestDay ? ` · Last day ${latestDay.date}` : ""}
          </p>
        </>
      ) : (
        <p className="muted">{getGitHubEmptyState(heatmap)}</p>
      )}
    </article>
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

function GitHubHeatmapStatusText({ heatmap }: { readonly heatmap: GitHubHeatmapResult }): React.JSX.Element {
  return <p className="muted">{formatGitHubStatus(heatmap)}</p>;
}

function GitHubHeatmapCell({ day }: { readonly day: GitHubContributionDay }): React.JSX.Element {
  return (
    <span
      aria-label={`${day.date}: ${day.contributionCount} contributions`}
      className={`github-day github-day-${getContributionLevel(day.contributionCount)}`}
      title={`${day.date}: ${day.contributionCount} contributions`}
    />
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

function ProviderSettingsField({
  provider,
  settings,
  label,
  name,
  onChange
}: {
  readonly provider: ProviderCard | null;
  readonly settings: AppSettings["providers"]["codex"];
  readonly label: string;
  readonly name: "codex" | "gemini";
  readonly onChange: (patch: Partial<AppSettings["providers"]["codex"]>) => void;
}): React.JSX.Element {
  const [setupResult, setSetupResult] = useState<WrapperSetupResult | null>(null);
  const [verificationResult, setVerificationResult] = useState<WrapperVerificationResult | null>(null);
  const [accuracyStatus, setAccuracyStatus] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"generate" | "verify" | null>(null);

  const generateWrapper = async () => {
    try {
      setBusyAction("generate");
      const result = await window.claudeUsage.generateWrapper(name);
      setSetupResult(result);
      setAccuracyStatus(`${label} wrapper generated. Run the setup command manually.`);
    } catch (error) {
      setAccuracyStatus(getErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  };

  const verifyWrapper = async () => {
    try {
      setBusyAction("verify");
      const result = await window.claudeUsage.verifyWrapper(name);
      setVerificationResult(result);
      setAccuracyStatus(result.message);
    } catch (error) {
      setAccuracyStatus(getErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  };

  const setupCommands = setupResult?.setupCommands?.length
    ? setupResult.setupCommands
    : setupResult?.command
      ? [setupResult.command]
      : [];
  const setupInstructions = setupResult?.instructions ?? [];
  const removalInstructions = setupResult?.removalInstructions?.length
    ? setupResult.removalInstructions
    : [`Removal: remove the generated ${label} wrapper directory from PATH when you no longer want Accuracy Mode.`];

  return (
    <fieldset className="settings-fieldset">
      <legend>{label}</legend>
      {provider ? (
        <>
          <p className="muted">{provider.confidenceExplanation}</p>
          <p className="muted">{provider.detailText ?? formatProviderStatus(provider)}</p>
        </>
      ) : (
        <p className="muted">Provider status has not been reported yet.</p>
      )}
      <label className="checkbox-label">
        <input
          checked={settings.enabled}
          name={`${name}-provider-enabled`}
          onChange={(event) => onChange({ enabled: event.target.checked })}
          type="checkbox"
        />
        Track when available
      </label>
      <label className="checkbox-label">
        <input
          checked={settings.setupPromptDismissed}
          name={`${name}-provider-dismissed`}
          onChange={(event) => onChange({ setupPromptDismissed: event.target.checked })}
          type="checkbox"
        />
        Hide setup notice
      </label>
      <section className="accuracy-mode-panel" aria-label={`${label} Accuracy Mode`}>
        <div className="provider-title-row">
          <div>
            <h4>Accuracy Mode</h4>
            <p className="muted">
              Optional wrapper setup records invocation timing and derived limit signals for better confidence.
            </p>
          </div>
          <StatusPill tone={settings.accuracyModeEnabled ? "active" : "muted"}>
            {settings.accuracyModeEnabled ? "On" : "Off"}
          </StatusPill>
        </div>
        <label className="checkbox-label">
          <input
            checked={settings.accuracyModeEnabled}
            name={`${name}-accuracy-mode-enabled`}
            onChange={(event) => onChange({ accuracyModeEnabled: event.target.checked })}
            type="checkbox"
          />
          Enable Accuracy Mode setup
        </label>
        <p className="muted">
          Wrappers are manual and reversible. ClaudeUsage does not edit shell profiles or PATH automatically, and it
          keeps only derived wrapper events.
        </p>
        <div className="inline-actions">
          <button disabled={busyAction !== null} onClick={() => void generateWrapper()} type="button">
            {busyAction === "generate" ? "Generating" : `Generate ${label} wrapper`}
          </button>
          <button disabled={busyAction !== null} onClick={() => void verifyWrapper()} type="button">
            {busyAction === "verify" ? "Verifying" : `Verify ${label} wrapper`}
          </button>
        </div>
        <div className="accuracy-mode-details">
          <div>
            <h5>Setup commands</h5>
            {setupCommands.length > 0 ? (
              <ul className="instruction-list">
                {setupCommands.map((command) => (
                  <li key={command}>
                    <code>{command}</code>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Generate the wrapper to get the command for your shell.</p>
            )}
            {setupInstructions.length > 0 ? (
              <ul className="instruction-list">
                {setupInstructions.map((instruction) => (
                  <li key={instruction}>{instruction}</li>
                ))}
              </ul>
            ) : null}
          </div>
          <div>
            <h5>Verification status</h5>
            <p className="muted">
              {verificationResult
                ? `${verificationResult.verified ? "Verified" : "Needs attention"}: ${verificationResult.message}`
                : "Run verification after manual setup."}
            </p>
          </div>
          <div>
            <h5>Troubleshooting</h5>
            <p className="muted">
              If verification does not pass, put the generated wrapper directory before the native CLI directory in
              PATH, restart open terminals, then verify again.
            </p>
          </div>
          <div>
            <h5>Removal</h5>
            <ul className="instruction-list">
              {removalInstructions.map((instruction) => (
                <li key={instruction}>{instruction}</li>
              ))}
            </ul>
          </div>
        </div>
        {accuracyStatus ? <p className="form-status">{accuracyStatus}</p> : null}
      </section>
      <label>
        Plan
        <select
          name={`${name}-provider-plan`}
          onChange={(event) => onChange({ plan: event.target.value as AppSettings["providers"]["codex"]["plan"] })}
          value={settings.plan}
        >
          <option value="unknown">Unknown</option>
          <option value="free">Free</option>
          <option value="pro">Pro</option>
          <option value="team">Team</option>
          <option value="enterprise">Enterprise</option>
        </select>
      </label>
      <label>
        Auth
        <select
          name={`${name}-provider-auth-mode`}
          onChange={(event) =>
            onChange({ authMode: event.target.value as AppSettings["providers"]["codex"]["authMode"] })
          }
          value={settings.authMode}
        >
          <option value="unknown">Unknown</option>
          <option value="oauth-personal">OAuth personal</option>
          <option value="api-key">API key</option>
          <option value="session-cookie">Browser session</option>
          <option value="none">None</option>
        </select>
      </label>
      <div className="inline-actions">
        <button onClick={() => void window.claudeUsage.runProviderDetection(name)} type="button">
          Refresh {label}
        </button>
        <button onClick={() => void window.claudeUsage.getProviderDiagnostics(name)} type="button">
          {label} diagnostics
        </button>
      </div>
    </fieldset>
  );
}

function findProviderCard(providerCards: readonly ProviderCard[], providerId: ProviderCard["providerId"]): ProviderCard | null {
  return providerCards.find((provider) => provider.providerId === providerId) ?? null;
}

function NotificationCheckbox({
  checked,
  label,
  name,
  onChange
}: {
  readonly checked: boolean;
  readonly label: string;
  readonly name: string;
  readonly onChange: (checked: boolean) => void;
}): React.JSX.Element {
  return (
    <label className="checkbox-label">
      <input checked={checked} name={name} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
      {label}
    </label>
  );
}

function getProviderTone(provider: ProviderCard): "active" | "muted" | "warning" {
  if (
    provider.status === "expired" ||
    provider.status === "degraded" ||
    provider.status === "missing_configuration" ||
    provider.status === "stale"
  ) {
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

  if (provider.status === "stale") {
    return "Stale";
  }

  return provider.enabled ? "Tracking" : "Off";
}

function formatProviderStatus(provider: ProviderCard): string {
  return `${formatToken(provider.status)} · ${formatToken(provider.confidence)}`;
}

function formatGitHubStatus(heatmap: GitHubHeatmapResult): string {
  if (!heatmap.enabled) {
    return "Disabled";
  }

  if (!heatmap.configured) {
    return "Username and token needed";
  }

  if (heatmap.status === "auth_expired") {
    return "GitHub token needs attention";
  }

  if (heatmap.error) {
    return heatmap.error;
  }

  if (heatmap.lastFetchedAt) {
    return `Updated ${formatDateTime(heatmap.lastFetchedAt)}`;
  }

  return "Ready to refresh";
}

function getGitHubEmptyState(heatmap: GitHubHeatmapResult): string {
  if (!heatmap.enabled) {
    return "Enable GitHub in Settings to show contribution activity.";
  }

  if (!heatmap.configured) {
    return "Add a GitHub username and token in Settings.";
  }

  if (heatmap.status === "auth_expired") {
    return "Saved GitHub token is invalid or expired.";
  }

  if (heatmap.error) {
    return heatmap.error;
  }

  return "Refresh GitHub to load the last 12 weeks.";
}

function getContributionLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) {
    return 0;
  }

  if (count <= 3) {
    return 1;
  }

  if (count <= 6) {
    return 2;
  }

  if (count <= 9) {
    return 3;
  }

  return 4;
}

function formatAccountStatus(account: AccountSummary): string {
  const orgLabel = account.orgId ? `Org ${account.orgId}` : "No organization";
  return `${formatToken(account.authStatus)} · ${orgLabel}`;
}

function formatPercent(value: number | null): string {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : "Pending";
}

function formatDailyRequests(value: number | null): string {
  if (typeof value !== "number") {
    return "Pending";
  }

  return `${value} ${value === 1 ? "request" : "requests"} today`;
}

function formatRequestsPerMinute(value: number | null): string {
  return typeof value === "number" ? `${value}/min` : "Pending";
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
