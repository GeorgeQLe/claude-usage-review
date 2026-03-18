import { invoke } from "@tauri-apps/api/core";
import { UsageState, AccountInfo, AppConfig } from "./types";

const app = document.getElementById("app")!;
let testResult: { status: string; message: string } | null = null;

async function init() {
  const state = await invoke<UsageState>("get_usage");
  const config = await invoke<AppConfig>("get_config");
  render(state, config);
}

function render(state: UsageState, config: AppConfig) {
  const activeAccount = state.accounts.find((a) => a.is_active);

  let html = '<div class="settings">';
  html += "<h2>ClaudeUsage Settings</h2>";

  if (activeAccount) {
    // Editable account name
    html += `
      <div class="editable-name">
        <input type="text" id="account-name" value="${escapeHtml(activeAccount.email)}" />
      </div>
    `;

    // Auth status
    html += `
      <div class="auth-status">
        <span class="auth-dot ${state.auth_status}"></span>
        <span>${authStatusText(state.auth_status)}</span>
      </div>
    `;

    // Credentials section
    html += `
      <div class="settings-section">
        <h3>Credentials</h3>
        <div class="form-group">
          <label>Session Key</label>
          <input type="password" id="session-key" placeholder="sk-ant-sid01-..." />
        </div>
        <div class="form-group">
          <label>Organization ID</label>
          <input type="text" id="org-id" placeholder="org-..." value="${escapeHtml(getOrgId(activeAccount, state))}" />
        </div>
        <div class="settings-actions">
          <button class="btn-save" id="btn-save">Save</button>
          <button class="btn-test" id="btn-test">Test Connection</button>
        </div>
        ${testResult ? `<div class="test-result ${testResult.status}">${testResult.message}</div>` : ""}
      </div>
    `;
  } else {
    html += `
      <div class="not-configured">
        <p>No account selected. Add an account from the popover.</p>
      </div>
    `;
  }

  // Preferences
  html += `
    <div class="settings-section">
      <h3>Preferences</h3>
      <div class="form-group">
        <label>Time Display</label>
        <select id="time-format">
          <option value="reset_time" ${config.time_display_format === "reset_time" ? "selected" : ""}>Reset Time</option>
          <option value="remaining_time" ${config.time_display_format === "remaining_time" ? "selected" : ""}>Remaining Time</option>
        </select>
      </div>
    </div>
  `;

  // Overlay section
  html += `
    <div class="settings-section">
      <h3>Desktop Overlay</h3>
      <div class="checkbox-group">
        <input type="checkbox" id="overlay-enabled" ${config.overlay_enabled ? "checked" : ""} />
        <label for="overlay-enabled">Enable overlay widget</label>
      </div>
      <div class="form-group">
        <label>Layout</label>
        <select id="overlay-layout" ${!config.overlay_enabled ? "disabled" : ""}>
          <option value="compact" ${config.overlay_layout === "compact" ? "selected" : ""}>Compact Bar</option>
          <option value="minimal" ${config.overlay_layout === "minimal" ? "selected" : ""}>Minimal Text</option>
          <option value="sidebar" ${config.overlay_layout === "sidebar" ? "selected" : ""}>Vertical Sidebar</option>
        </select>
      </div>
      <div class="slider-group">
        <label>Opacity: ${Math.round(config.overlay_opacity * 100)}%</label>
        <input type="range" id="overlay-opacity" min="20" max="100"
          value="${Math.round(config.overlay_opacity * 100)}"
          ${!config.overlay_enabled ? "disabled" : ""} />
      </div>
    </div>
  `;

  // Account list (when 2+ accounts)
  if (state.accounts.length >= 2) {
    html += `
      <div class="settings-section">
        <h3>Accounts</h3>
        <div class="account-list">
          ${state.accounts
            .map(
              (a) => `
            <div class="account-list-item">
              <span class="name">${escapeHtml(a.email)} ${a.is_active ? "(active)" : ""}</span>
              <button class="btn-delete" data-id="${a.id}" title="Remove">🗑</button>
            </div>
          `
            )
            .join("")}
        </div>
      </div>
    `;
  }

  html += "</div>";
  app.innerHTML = html;

  // Bind events
  bindEvents(state, config);
}

function bindEvents(state: UsageState, config: AppConfig) {
  const activeAccount = state.accounts.find((a) => a.is_active);

  // Account name editing
  document.getElementById("account-name")?.addEventListener("blur", async (e) => {
    const input = e.target as HTMLInputElement;
    if (activeAccount && input.value.trim() !== activeAccount.email) {
      await invoke("rename_account", {
        accountId: activeAccount.id,
        newName: input.value.trim(),
      });
    }
  });

  // Save credentials
  document.getElementById("btn-save")?.addEventListener("click", async () => {
    if (!activeAccount) return;
    const sessionKey = (document.getElementById("session-key") as HTMLInputElement).value;
    const orgId = (document.getElementById("org-id") as HTMLInputElement).value;
    if (sessionKey && orgId) {
      await invoke("save_credentials", {
        accountId: activeAccount.id,
        sessionKey,
        orgId,
      });
      testResult = { status: "success", message: "Credentials saved. Fetching data..." };
      const newState = await invoke<UsageState>("get_usage");
      render(newState, config);
    }
  });

  // Test connection
  document.getElementById("btn-test")?.addEventListener("click", async () => {
    const sessionKey = (document.getElementById("session-key") as HTMLInputElement).value;
    const orgId = (document.getElementById("org-id") as HTMLInputElement).value;
    if (!sessionKey || !orgId) {
      testResult = { status: "error", message: "Enter both Session Key and Org ID" };
      render(state, config);
      return;
    }
    const result = await invoke<string>("test_connection", { sessionKey, orgId });
    if (result === "connected") {
      testResult = { status: "success", message: "Connection successful!" };
    } else if (result === "auth_error") {
      testResult = { status: "error", message: "Authentication failed. Check your credentials." };
    } else {
      testResult = { status: "error", message: result };
    }
    render(state, config);
  });

  // Time format
  document.getElementById("time-format")?.addEventListener("change", async (e) => {
    const value = (e.target as HTMLSelectElement).value;
    await invoke("update_config", { key: "time_display_format", value: JSON.parse(`"${value}"`) });
  });

  // Overlay toggle
  document.getElementById("overlay-enabled")?.addEventListener("change", async () => {
    await invoke("toggle_overlay");
    const newConfig = await invoke<AppConfig>("get_config");
    render(state, newConfig);
  });

  // Overlay layout
  document.getElementById("overlay-layout")?.addEventListener("change", async (e) => {
    const value = (e.target as HTMLSelectElement).value;
    await invoke("set_overlay_layout", { layout: value });
  });

  // Overlay opacity
  document.getElementById("overlay-opacity")?.addEventListener("input", async (e) => {
    const value = parseInt((e.target as HTMLInputElement).value);
    await invoke("set_overlay_opacity", { opacity: value / 100 });
    // Update label
    const label = (e.target as HTMLInputElement).previousElementSibling;
    if (label) label.textContent = `Opacity: ${value}%`;
  });

  // Delete account buttons
  document.querySelectorAll(".btn-delete").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = (btn as HTMLElement).dataset.id!;
      if (confirm("Remove this account?")) {
        await invoke("remove_account", { accountId: id });
        const newState = await invoke<UsageState>("get_usage");
        const newConfig = await invoke<AppConfig>("get_config");
        render(newState, newConfig);
      }
    });
  });
}

function authStatusText(status: string): string {
  switch (status) {
    case "connected":
      return "Connected";
    case "expired":
      return "Session Expired";
    default:
      return "Not Configured";
  }
}

function getOrgId(_account: AccountInfo, _state: UsageState): string {
  // Org ID is in the config, not exposed directly to frontend
  // User will need to enter it
  return "";
}

function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

init();
