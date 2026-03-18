import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { UsageState } from "./types";
import { createUsageBar } from "./components/usage-bar";
import { createAccountPicker } from "./components/account-picker";

const app = document.getElementById("app")!;
let showAddAccount = false;

async function init() {
  const state = await invoke<UsageState>("get_usage");
  render(state);

  await listen<UsageState>("usage-updated", (event) => {
    render(event.payload);
  });
}

function render(state: UsageState) {
  let html = '<div class="popover">';

  // Account picker (when 2+ accounts)
  if (state.accounts.length >= 2) {
    const pickerEl = createAccountPicker(state.accounts, async (id) => {
      await invoke("set_active_account", { accountId: id });
    });
    html += `<div id="account-picker-slot"></div>`;
    requestAnimationFrame(() => {
      const slot = document.getElementById("account-picker-slot");
      if (slot) {
        slot.replaceWith(pickerEl);
      }
    });
  }

  // Error states
  if (state.error_state === "auth_expired") {
    html += `<div class="error-banner auth">Session expired. Update credentials in Settings.</div>`;
  } else if (state.error_state === "network_error") {
    html += `<div class="error-banner network">Network error. Will retry automatically.</div>`;
  }

  // Not configured
  if (state.auth_status === "not_configured" && state.accounts.length === 0) {
    html += `
      <div class="not-configured">
        <p>No accounts configured.</p>
        <button class="btn-primary" id="btn-open-settings">Open Settings</button>
      </div>
    `;
  } else if (state.display_limits.length === 0 && state.error_state === null) {
    html += `<div class="loading">Loading usage data...</div>`;
  } else {
    // Usage bars
    for (const limit of state.display_limits) {
      html += createUsageBar(limit);
    }
  }

  // Add account form
  if (showAddAccount) {
    html += `
      <div class="add-account-form">
        <input type="text" id="new-account-name" placeholder="Account name" autofocus />
        <button id="btn-add-confirm">Add</button>
      </div>
    `;
  }

  // Toolbar
  html += `
    <div class="toolbar">
      <span class="toolbar-left">${state.last_updated || "Not updated"}</span>
      <div class="toolbar-right">
        <button class="toolbar-btn" id="btn-add-account" title="Add Account">+</button>
        <button class="toolbar-btn" id="btn-refresh" title="Refresh">⟳</button>
        <button class="toolbar-btn" id="btn-settings" title="Settings">⚙</button>
        <button class="toolbar-btn" id="btn-quit" title="Quit">✕</button>
      </div>
    </div>
  `;

  html += "</div>";
  app.innerHTML = html;

  // Bind events
  document.getElementById("btn-open-settings")?.addEventListener("click", openSettings);
  document.getElementById("btn-settings")?.addEventListener("click", openSettings);
  document.getElementById("btn-refresh")?.addEventListener("click", async () => {
    await invoke("refresh_now");
  });
  document.getElementById("btn-quit")?.addEventListener("click", async () => {
    const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    getCurrentWebviewWindow().close();
  });
  document.getElementById("btn-add-account")?.addEventListener("click", () => {
    showAddAccount = !showAddAccount;
    render(state);
  });
  document.getElementById("btn-add-confirm")?.addEventListener("click", async () => {
    const input = document.getElementById("new-account-name") as HTMLInputElement;
    if (input.value.trim()) {
      await invoke("add_account", { email: input.value.trim() });
      showAddAccount = false;
      const newState = await invoke<UsageState>("get_usage");
      render(newState);
    }
  });
}

async function openSettings() {
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  const existing = await WebviewWindow.getByLabel("settings");
  if (existing) {
    await existing.setFocus();
  } else {
    new WebviewWindow("settings", {
      url: "settings.html",
      title: "ClaudeUsage Settings",
      width: 320,
      height: 520,
      resizable: false,
      center: true,
    });
  }
}

init();
