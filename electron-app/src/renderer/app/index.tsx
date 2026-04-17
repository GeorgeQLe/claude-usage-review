import React from "react";
import { createRoot } from "react-dom/client";
import {
  AccountList,
  ErrorState,
  getClaudeProvider,
  LoadingState,
  ProviderList,
  SettingsSummary,
  WarningBanner,
  WindowFrame,
  useRendererSnapshot
} from "../components/index.js";
import { OnboardingRoute } from "../onboarding/index.js";
import { OverlayRoute } from "../overlay/index.js";
import { SettingsRoute } from "../settings/index.js";
import "../styles/app.css";

type RendererRoute = "popover" | "settings" | "onboarding" | "overlay" | "smoke-error";

declare global {
  interface Window {
    __CLAUDE_USAGE_SKIP_AUTO_MOUNT__?: boolean;
    __CLAUDE_USAGE_SMOKE__?: boolean;
  }
}

export function App(): React.JSX.Element {
  const [route, setRoute] = React.useState<RendererRoute>(() => getRouteFromHash(window.location.hash));

  React.useEffect(() => {
    const handleHashChange = () => {
      setRoute(getRouteFromHash(window.location.hash));
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  switch (route) {
    case "settings":
      return <SettingsRoute />;
    case "onboarding":
      return <OnboardingRoute />;
    case "overlay":
      return <OverlayRoute />;
    case "smoke-error":
      return (
        <ErrorState
          message="Synthetic smoke renderer error."
          onRetry={() => {
            window.location.hash = "settings";
          }}
        />
      );
    case "popover":
    default:
      return <PopoverRoute />;
  }
}

export function PopoverRoute(): React.JSX.Element {
  const resource = useRendererSnapshot({ subscribeToUsage: true });

  if (resource.status === "loading") {
    return <LoadingState />;
  }

  if (resource.status === "error") {
    return <ErrorState message={resource.error} onRetry={() => void resource.reload()} />;
  }

  const { accounts, githubHeatmap, settings, usageHistory, usageState } = resource.snapshot;
  const activeAccount = accounts.find((account) => account.isActive) ?? null;
  const claudeProvider = getClaudeProvider(usageState);

  return (
    <WindowFrame
      actions={
        <button disabled={resource.isRefreshing} onClick={() => void resource.refreshNow()} type="button">
          {resource.isRefreshing ? "Refreshing" : "Refresh"}
        </button>
      }
      eyebrow="ClaudeUsage"
      title="Usage overview"
    >
      <WarningBanner warning={usageState.warning} />
      <ProviderList
        activeAccount={activeAccount}
        githubHeatmap={githubHeatmap}
        providers={usageState.providers}
        usageHistory={usageHistory}
      />
      <section className="content-grid content-grid-two">
        <div className="panel">
          <h2>Active account</h2>
          {activeAccount ? <AccountList accounts={[activeAccount]} /> : <p className="muted">No active account.</p>}
        </div>
        <div className="panel">
          <h2>Claude timing</h2>
          <SettingsSummary settings={settings} />
          {claudeProvider?.resetAt ? <p className="muted">Next reset is tracked from Claude usage data.</p> : null}
        </div>
      </section>
    </WindowFrame>
  );
}

export function getRouteFromHash(hash: string): RendererRoute {
  const route = hash.replace(/^#/u, "");

  if (route === "settings" || route === "onboarding" || route === "overlay") {
    return route;
  }

  if (route === "smoke-error" && window.__CLAUDE_USAGE_SMOKE__ === true) {
    return "smoke-error";
  }

  return "popover";
}

export function mountRenderer(root: HTMLElement | null = document.getElementById("root")): void {
  if (!root) {
    throw new Error("Renderer root element was not found.");
  }

  createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

if (!window.__CLAUDE_USAGE_SKIP_AUTO_MOUNT__) {
  mountRenderer();
}
