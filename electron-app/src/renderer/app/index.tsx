import React from "react";
import { createRoot } from "react-dom/client";
import {
  AccountList,
  ErrorState,
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

type RendererRoute = "popover" | "settings" | "onboarding" | "overlay";

function App(): React.JSX.Element {
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
    case "popover":
    default:
      return <PopoverRoute />;
  }
}

function PopoverRoute(): React.JSX.Element {
  const resource = useRendererSnapshot({ subscribeToUsage: true });

  if (resource.status === "loading") {
    return <LoadingState />;
  }

  if (resource.status === "error") {
    return <ErrorState message={resource.error} onRetry={() => void resource.reload()} />;
  }

  const { accounts, settings, usageState } = resource.snapshot;
  const activeAccount = accounts.find((account) => account.isActive) ?? null;

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
      <ProviderList providers={usageState.providers} />
      <section className="content-grid content-grid-two">
        <div className="panel">
          <h2>Active account</h2>
          {activeAccount ? <AccountList accounts={[activeAccount]} /> : <p className="muted">No active account.</p>}
        </div>
        <div className="panel">
          <h2>Display</h2>
          <SettingsSummary settings={settings} />
        </div>
      </section>
    </WindowFrame>
  );
}

function getRouteFromHash(hash: string): RendererRoute {
  const route = hash.replace(/^#/u, "");

  if (route === "settings" || route === "onboarding" || route === "overlay") {
    return route;
  }

  return "popover";
}

const root = document.getElementById("root");

if (!root) {
  throw new Error("Renderer root element was not found.");
}

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
