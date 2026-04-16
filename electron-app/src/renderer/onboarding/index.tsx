import {
  AccountManager,
  ClaudeCredentialForm,
  ErrorState,
  LoadingState,
  ProviderList,
  WarningBanner,
  WindowFrame,
  useRendererSnapshot
} from "../components/index.js";

export function OnboardingRoute(): React.JSX.Element {
  const resource = useRendererSnapshot();

  if (resource.status === "loading") {
    return <LoadingState label="Preparing setup" />;
  }

  if (resource.status === "error") {
    return <ErrorState message={resource.error} onRetry={() => void resource.reload()} />;
  }

  const { accounts, githubHeatmap, settings, usageHistory, usageState } = resource.snapshot;
  const activeAccount = accounts.find((account) => account.isActive) ?? null;

  return (
    <WindowFrame eyebrow="Setup" title="Connect usage tracking">
      <WarningBanner warning={usageState.warning} />
      <section className="setup-steps">
        <article className="setup-step">
          <span className="step-number">1</span>
          <div>
            <h2>Choose a local account</h2>
            <AccountManager
              accounts={accounts}
              onAdd={resource.addAccount}
              onRemove={resource.removeAccount}
              onRename={resource.renameAccount}
              onSwitch={resource.setActiveAccount}
            />
          </div>
        </article>
        <article className="setup-step">
          <span className="step-number">2</span>
          <div>
            <h2>Add Claude credentials</h2>
            <ClaudeCredentialForm
              activeAccount={activeAccount}
              onSaveCredentials={resource.saveClaudeCredentials}
              onTestConnection={resource.testClaudeConnection}
            />
          </div>
        </article>
        <article className="setup-step">
          <span className="step-number">3</span>
          <div>
            <h2>Review provider status</h2>
            <ProviderList
              activeAccount={activeAccount}
              githubHeatmap={githubHeatmap}
              providers={usageState.providers}
              usageHistory={usageHistory}
            />
          </div>
        </article>
      </section>
      <section className="panel">
        <h2>Display defaults</h2>
        <p className="muted">
          {settings.timeDisplay === "countdown" ? "Countdown reset times are enabled." : "Reset times use clock labels."}
        </p>
      </section>
    </WindowFrame>
  );
}
