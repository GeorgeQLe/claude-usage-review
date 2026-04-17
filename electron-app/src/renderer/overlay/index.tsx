import { useState } from "react";
import type { AccountSummary } from "../../shared/types/accounts.js";
import type { ProviderCard } from "../../shared/types/provider.js";
import type { AppSettings } from "../../shared/types/settings.js";
import {
  ErrorState,
  LoadingState,
  StatusPill,
  WarningBanner,
  useRendererSnapshot
} from "../components/index.js";

export function OverlayRoute(): React.JSX.Element {
  const resource = useRendererSnapshot({ subscribeToUsage: true });
  const [menuOpen, setMenuOpen] = useState(false);

  if (resource.status === "loading") {
    return <LoadingState label="Loading overlay" />;
  }

  if (resource.status === "error") {
    return <ErrorState message={resource.error} onRetry={() => void resource.reload()} />;
  }

  const { accounts, settings, usageState } = resource.snapshot;
  const activeAccount = accounts.find((account) => account.isActive) ?? null;
  const activeProvider = getActiveProvider(usageState);
  const overlaySettings = settings.overlay;
  const layout = overlaySettings.layout;

  const hideOverlay = async () => {
    setMenuOpen(false);
    await resource.updateSettings({ overlay: { visible: false } });
    await window.claudeUsage.hideOverlay();
  };

  const disableOverlay = async () => {
    setMenuOpen(false);
    await resource.updateSettings({ overlay: { enabled: false, visible: false } });
    await window.claudeUsage.hideOverlay();
  };

  return (
    <main
      className={`overlay-frame overlay-frame-${layout}`}
      onContextMenu={(event) => {
        event.preventDefault();
        setMenuOpen(true);
      }}
      onDoubleClick={() => {
        void window.claudeUsage.openPopover();
      }}
      style={{ opacity: overlaySettings.opacity }}
    >
      <WarningBanner warning={usageState.warning} />
      {menuOpen ? (
        <div className="overlay-actions" role="menu">
          <button onClick={() => void hideOverlay()} type="button">
            Hide
          </button>
          <button onClick={() => void disableOverlay()} type="button">
            Disable
          </button>
          <button onClick={() => setMenuOpen(false)} type="button">
            Close
          </button>
        </div>
      ) : null}
      {activeProvider ? (
        <OverlayContent activeAccount={activeAccount} layout={layout} provider={activeProvider} />
      ) : (
        <section className="overlay-empty" aria-label="Overlay status">
          <p className="eyebrow">ClaudeUsage</p>
          <h1>No providers available</h1>
        </section>
      )}
    </main>
  );
}

function OverlayContent({
  activeAccount,
  layout,
  provider
}: {
  readonly activeAccount: AccountSummary | null;
  readonly layout: AppSettings["overlay"]["layout"];
  readonly provider: ProviderCard;
}): React.JSX.Element {
  if (layout === "minimal") {
    return <MinimalOverlay provider={provider} />;
  }

  if (layout === "sidebar") {
    return <SidebarOverlay activeAccount={activeAccount} provider={provider} />;
  }

  return <CompactOverlay activeAccount={activeAccount} provider={provider} />;
}

function MinimalOverlay({ provider }: { readonly provider: ProviderCard }): React.JSX.Element {
  const primaryValue = provider.providerId === "claude" ? formatPercent(provider.sessionUtilization) : formatProviderPrimary(provider);
  return (
    <section className="overlay-minimal" aria-label="Overlay status">
      <div>
        <p className="eyebrow">{provider.displayName}</p>
        <h1>{primaryValue}</h1>
      </div>
      <StatusPill tone={getProviderTone(provider)}>{formatProviderPill(provider)}</StatusPill>
    </section>
  );
}

function CompactOverlay({
  activeAccount,
  provider
}: {
  readonly activeAccount: AccountSummary | null;
  readonly provider: ProviderCard;
}): React.JSX.Element {
  if (provider.providerId !== "claude") {
    return <PassiveCompactOverlay provider={provider} />;
  }

  return (
    <section className="overlay-compact" aria-label="Overlay status">
      <div className="overlay-title-row">
        <div>
          <p className="eyebrow">{provider.displayName}</p>
          <h1>{formatPercent(provider.sessionUtilization)} session</h1>
        </div>
        <StatusPill tone={getProviderTone(provider)}>{formatProviderPill(provider)}</StatusPill>
      </div>
      <p className="muted">{provider.headline}</p>
      <OverlayMeter label="Five-hour" value={provider.sessionUtilization} />
      <OverlayMeter label="Weekly" value={provider.weeklyUtilization} />
      <div className="overlay-meta">
        <span>{activeAccount ? activeAccount.label : "No account"}</span>
        <span>{formatDateTime(provider.lastUpdatedAt)}</span>
      </div>
    </section>
  );
}

function SidebarOverlay({
  activeAccount,
  provider
}: {
  readonly activeAccount: AccountSummary | null;
  readonly provider: ProviderCard;
}): React.JSX.Element {
  if (provider.providerId !== "claude") {
    return <PassiveSidebarOverlay provider={provider} />;
  }

  return (
    <section className="overlay-sidebar" aria-label="Overlay status">
      <div className="overlay-title-row">
        <div>
          <p className="eyebrow">{provider.displayName}</p>
          <h1>Usage</h1>
        </div>
        <StatusPill tone={getProviderTone(provider)}>{formatProviderPill(provider)}</StatusPill>
      </div>
      <p className="overlay-headline">{provider.headline}</p>
      {provider.detailText ? <p className="muted">{provider.detailText}</p> : null}
      <div className="overlay-meter-stack">
        <OverlayMeter label="Five-hour usage" value={provider.sessionUtilization} />
        <OverlayMeter label="Weekly usage" value={provider.weeklyUtilization} />
      </div>
      <div className="overlay-metric-grid">
        <OverlayMetric label="Reset" value={formatDateTime(provider.resetAt)} />
        <OverlayMetric label="Updated" value={formatDateTime(provider.lastUpdatedAt)} />
        <OverlayMetric label="Account" value={activeAccount ? activeAccount.label : "No account"} />
        <OverlayMetric label="Auth" value={activeAccount ? formatToken(activeAccount.authStatus) : "Missing Credentials"} />
      </div>
    </section>
  );
}

function PassiveCompactOverlay({ provider }: { readonly provider: ProviderCard }): React.JSX.Element {
  return (
    <section className="overlay-compact" aria-label="Overlay status">
      <div className="overlay-title-row">
        <div>
          <p className="eyebrow">{provider.displayName}</p>
          <h1>{formatProviderPrimary(provider)}</h1>
        </div>
        <StatusPill tone={getProviderTone(provider)}>{formatProviderPill(provider)}</StatusPill>
      </div>
      <p className="muted">{provider.headline}</p>
      {provider.detailText ? <p className="muted">{provider.detailText}</p> : null}
      <p className="muted">{provider.confidenceExplanation}</p>
      <div className="overlay-meta">
        <span>{formatRequestsPerMinute(provider.requestsPerMinute)}</span>
        <span>{formatDateTime(provider.lastUpdatedAt)}</span>
      </div>
    </section>
  );
}

function PassiveSidebarOverlay({ provider }: { readonly provider: ProviderCard }): React.JSX.Element {
  return (
    <section className="overlay-sidebar" aria-label="Overlay status">
      <div className="overlay-title-row">
        <div>
          <p className="eyebrow">{provider.displayName}</p>
          <h1>{formatProviderPrimary(provider)}</h1>
        </div>
        <StatusPill tone={getProviderTone(provider)}>{formatProviderPill(provider)}</StatusPill>
      </div>
      <p className="overlay-headline">{provider.headline}</p>
      {provider.detailText ? <p className="muted">{provider.detailText}</p> : null}
      <p className="muted">{provider.confidenceExplanation}</p>
      <div className="overlay-metric-grid">
        <OverlayMetric label="Requests" value={formatDailyRequests(provider.dailyRequestCount)} />
        <OverlayMetric label="Rate" value={formatRequestsPerMinute(provider.requestsPerMinute)} />
        <OverlayMetric label="Updated" value={formatDateTime(provider.lastUpdatedAt)} />
        <OverlayMetric label="Mode" value={formatToken(provider.adapterMode)} />
      </div>
    </section>
  );
}

function OverlayMeter({ label, value }: { readonly label: string; readonly value: number | null }): React.JSX.Element {
  return (
    <div className="overlay-meter">
      <div className="overlay-meter-label">
        <span>{label}</span>
        <strong>{formatPercent(value)}</strong>
      </div>
      <div className="usage-meter-track" aria-hidden="true">
        <div className="usage-meter-fill" style={{ width: formatMeterWidth(value) }} />
      </div>
    </div>
  );
}

function OverlayMetric({ label, value }: { readonly label: string; readonly value: string }): React.JSX.Element {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
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

function formatPercent(value: number | null): string {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : "Pending";
}

function getActiveProvider(usageState: { readonly activeProviderId: ProviderCard["providerId"] | null; readonly providers: readonly ProviderCard[] }): ProviderCard | null {
  return (
    usageState.providers.find((provider) => provider.providerId === usageState.activeProviderId) ??
    usageState.providers.find((provider) => provider.providerId === "claude") ??
    usageState.providers.find((provider) => provider.enabled) ??
    usageState.providers[0] ??
    null
  );
}

function formatProviderPrimary(provider: ProviderCard): string {
  return formatDailyRequests(provider.dailyRequestCount);
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
