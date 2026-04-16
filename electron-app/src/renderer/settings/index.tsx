import {
  AccountManager,
  ClaudeCredentialForm,
  ErrorState,
  LoadingState,
  SettingsSummary,
  WarningBanner,
  WindowFrame,
  useRendererSnapshot
} from "../components/index.js";

export function SettingsRoute(): React.JSX.Element {
  const resource = useRendererSnapshot();

  if (resource.status === "loading") {
    return <LoadingState label="Loading settings" />;
  }

  if (resource.status === "error") {
    return <ErrorState message={resource.error} onRetry={() => void resource.reload()} />;
  }

  const { accounts, settings, usageState } = resource.snapshot;
  const activeAccount = accounts.find((account) => account.isActive) ?? null;

  return (
    <WindowFrame eyebrow="Settings" title="Account and display">
      <WarningBanner warning={usageState.warning} />
      <section className="content-grid content-grid-two">
        <div className="panel">
          <h2>Preferences</h2>
          <SettingsSummary settings={settings} />
        </div>
        <div className="panel">
          <h2>Claude credentials</h2>
          <ClaudeCredentialForm
            activeAccount={activeAccount}
            onSaveCredentials={resource.saveClaudeCredentials}
            onTestConnection={resource.testClaudeConnection}
          />
        </div>
      </section>
      <section className="panel">
        <h2>Accounts</h2>
        <AccountManager
          accounts={accounts}
          onAdd={resource.addAccount}
          onRemove={resource.removeAccount}
          onRename={resource.renameAccount}
          onSwitch={resource.setActiveAccount}
        />
      </section>
    </WindowFrame>
  );
}
