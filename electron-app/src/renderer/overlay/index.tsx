import { ErrorState, LoadingState, StatusPill, WarningBanner, WindowFrame, useRendererSnapshot } from "../components/index.js";

export function OverlayRoute(): React.JSX.Element {
  const resource = useRendererSnapshot({ subscribeToUsage: true });

  if (resource.status === "loading") {
    return <LoadingState label="Loading overlay" />;
  }

  if (resource.status === "error") {
    return <ErrorState message={resource.error} onRetry={() => void resource.reload()} />;
  }

  const { usageState } = resource.snapshot;
  const activeProvider =
    usageState.providers.find((provider) => provider.providerId === usageState.activeProviderId) ??
    usageState.providers[0] ??
    null;

  return (
    <WindowFrame eyebrow="Overlay" title={activeProvider ? activeProvider.displayName : "Usage"}>
      <WarningBanner warning={usageState.warning} />
      <section className="overlay-status" aria-label="Overlay status">
        {activeProvider ? (
          <>
            <div>
              <p className="overlay-headline">{activeProvider.headline}</p>
              <p className="muted">{activeProvider.confidenceExplanation}</p>
            </div>
            <StatusPill tone={activeProvider.enabled ? "active" : "warning"}>
              {activeProvider.enabled ? "Tracking" : "Setup"}
            </StatusPill>
          </>
        ) : (
          <p className="muted">No providers available.</p>
        )}
      </section>
    </WindowFrame>
  );
}
