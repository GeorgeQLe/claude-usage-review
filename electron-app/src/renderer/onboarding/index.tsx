import { useState } from "react";
import {
  AccountManager,
  ClaudeCredentialForm,
  ErrorState,
  GitHubSettingsForm,
  LoadingState,
  ProviderList,
  SettingsControls,
  WarningBanner,
  WindowFrame,
  useRendererSnapshot
} from "../components/index.js";

export function OnboardingRoute(): React.JSX.Element {
  const resource = useRendererSnapshot();
  const [status, setStatus] = useState<string | null>(null);

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
            <h2>Add GitHub contributions</h2>
            <p className="muted">This can stay off until you want contribution activity beside usage.</p>
            <GitHubSettingsForm
              heatmap={githubHeatmap}
              onRefresh={resource.refreshGitHubHeatmap}
              onSave={resource.saveGitHubSettings}
            />
          </div>
        </article>
        <article className="setup-step">
          <span className="step-number">4</span>
          <div>
            <h2>Choose defaults</h2>
            <SettingsControls settings={settings} onUpdateSettings={resource.updateSettings} />
          </div>
        </article>
        <article className="setup-step">
          <span className="step-number">5</span>
          <div>
            <h2>Optional Accuracy Mode</h2>
            <p className="muted">
              Accuracy Mode uses manual setup for Codex and Gemini wrappers, does not edit shell profiles, and does
              not store prompts or stdout.
            </p>
          </div>
        </article>
        <article className="setup-step">
          <span className="step-number">6</span>
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
        <h2>Finish setup</h2>
        <p className="muted">Setup can be completed or skipped without saving credentials.</p>
        <div className="button-row">
          <button
            onClick={() =>
              void resource.updateSettings({ onboarding: { completed: true, skipped: false } }).then(() => {
                setStatus("Setup marked complete.");
              })
            }
            type="button"
          >
            Complete setup
          </button>
          <button
            onClick={() =>
              void resource.updateSettings({ onboarding: { completed: false, skipped: true } }).then(() => {
                setStatus("Setup skipped.");
              })
            }
            type="button"
          >
            Skip for now
          </button>
        </div>
        {status ? <p className="form-status">{status}</p> : null}
      </section>
    </WindowFrame>
  );
}
