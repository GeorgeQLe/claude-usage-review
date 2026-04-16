import {
  ClaudeUsageCard,
  ErrorState,
  getClaudeProvider,
  LoadingState,
  WarningBanner,
  WindowFrame,
  useRendererSnapshot
} from "../components/index.js";

export function OverlayRoute(): React.JSX.Element {
  const resource = useRendererSnapshot({ subscribeToUsage: true });

  if (resource.status === "loading") {
    return <LoadingState label="Loading overlay" />;
  }

  if (resource.status === "error") {
    return <ErrorState message={resource.error} onRetry={() => void resource.reload()} />;
  }

  const { accounts, usageHistory, usageState } = resource.snapshot;
  const activeAccount = accounts.find((account) => account.isActive) ?? null;
  const claudeProvider = getClaudeProvider(usageState);

  return (
    <WindowFrame eyebrow="Overlay" title={claudeProvider ? claudeProvider.displayName : "Usage"}>
      <WarningBanner warning={usageState.warning} />
      <section className="overlay-status" aria-label="Overlay status">
        {claudeProvider ? (
          <ClaudeUsageCard activeAccount={activeAccount} compact provider={claudeProvider} usageHistory={usageHistory} />
        ) : (
          <p className="muted">No providers available.</p>
        )}
      </section>
    </WindowFrame>
  );
}
