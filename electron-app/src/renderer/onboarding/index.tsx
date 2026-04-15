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

export function OnboardingRoute(): React.JSX.Element {
  const resource = useRendererSnapshot();

  if (resource.status === "loading") {
    return <LoadingState label="Preparing setup" />;
  }

  if (resource.status === "error") {
    return <ErrorState message={resource.error} onRetry={() => void resource.reload()} />;
  }

  const { accounts, settings, usageState } = resource.snapshot;

  return (
    <WindowFrame eyebrow="Setup" title="Connect usage tracking">
      <WarningBanner warning={usageState.warning} />
      <section className="setup-steps">
        <article className="setup-step">
          <span className="step-number">1</span>
          <div>
            <h2>Choose a local account</h2>
            <AccountList accounts={accounts} />
          </div>
        </article>
        <article className="setup-step">
          <span className="step-number">2</span>
          <div>
            <h2>Add Claude credentials in Settings</h2>
            <p className="muted">Credentials stay write-only after saving.</p>
          </div>
        </article>
        <article className="setup-step">
          <span className="step-number">3</span>
          <div>
            <h2>Review provider status</h2>
            <ProviderList providers={usageState.providers} />
          </div>
        </article>
      </section>
      <section className="panel">
        <h2>Display defaults</h2>
        <SettingsSummary settings={settings} />
      </section>
    </WindowFrame>
  );
}
