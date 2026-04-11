import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { UsageState, ProviderCard } from "./types";
import { createUsageBar } from "./components/usage-bar";
import { createAccountPicker } from "./components/account-picker";

const app = document.getElementById("app")!;
let showAddAccount = false;

async function init() {
  let state: UsageState;
  try {
    state = await invoke<UsageState>("get_usage");
  } catch (e) {
    console.error("Failed to load usage state:", e);
    app.innerHTML = `
      <div class="popover">
        <div class="error-banner network" id="init-retry">Failed to load — click to retry</div>
      </div>`;
    app.querySelector("#init-retry")?.addEventListener("click", () => init());
    return;
  }
  render(state);

  await listen<UsageState>("usage-updated", (event) => {
    try {
      render(event.payload);
    } catch (e) {
      console.error("Render error on usage-updated:", e);
    }
  });
}

const PROVIDER_NAMES: Record<string, string> = {
  claude: "Claude",
  codex: "Codex CLI",
  gemini: "Gemini CLI",
};

function utilColor(pct: number): string {
  if (pct >= 80) return "var(--red)";
  if (pct >= 50) return "var(--yellow)";
  return "var(--green)";
}

function renderProviderCard(card: ProviderCard): string {
  const name = PROVIDER_NAMES[card.id] ?? card.id;

  if (card.card_state === "missing_configuration") {
    return `
      <div class="provider-card">
        <div class="provider-card-header">${name}</div>
        <div class="provider-card-headline" style="color:var(--text-muted)">Not configured</div>
      </div>`;
  }

  let inner = `<div class="provider-card-header">${name}`;
  if (card.card_state === "stale") {
    inner += ' <span class="stale-badge">stale</span>';
  } else if (card.card_state === "degraded") {
    inner += ' <span class="degraded-badge">degraded</span>';
  }
  inner += `</div>`;
  inner += `<div class="provider-card-headline">${card.headline}</div>`;

  if (card.session_utilization !== null) {
    const pct = Math.round(card.session_utilization);
    inner += `
      <div class="usage-bar" style="margin-top:6px">
        <div class="usage-bar-track">
          <div class="usage-bar-fill" style="width:${pct}%;background:${utilColor(pct)}"></div>
        </div>
      </div>`;
  }

  if (card.confidence_explanation) {
    inner += `<div class="confidence-badge">${card.confidence_explanation}</div>`;
  }

  return `<div class="provider-card">${inner}</div>`;
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
    html += `<div class="error-banner network" id="network-error-retry" style="cursor:pointer">Network error. Click to retry.</div>`;
  }

  // Not configured
  if (state.auth_status === "not_configured" && state.accounts.length === 0) {
    html += `
      <div class="not-configured">
        <p>No accounts configured.</p>
        <button class="btn-primary" id="btn-open-settings">Open Settings</button>
      </div>
    `;
  } else if (state.display_limits.length === 0 && state.error_state === null && !state.last_updated) {
    html += `<div class="loading">Loading usage data...</div>`;
  } else if (state.display_limits.length === 0 && state.error_state === null && state.last_updated) {
    html += `<div class="loading">No usage data available</div>`;
  } else {
    // Usage bars
    for (const limit of state.display_limits) {
      html += createUsageBar(limit);
    }
  }

  // Provider cards
  if (state.provider_cards && state.provider_cards.length > 0) {
    html += '<div class="provider-cards">';
    for (const card of state.provider_cards) {
      html += renderProviderCard(card);
    }
    html += '</div>';
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
  document.getElementById("network-error-retry")?.addEventListener("click", async () => {
    try { await invoke("refresh_now"); } catch (e) { console.error("Refresh failed:", e); }
  });
  document.getElementById("btn-refresh")?.addEventListener("click", async () => {
    try { await invoke("refresh_now"); } catch (e) { console.error("Refresh failed:", e); }
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
      try {
        await invoke("add_account", { name: input.value.trim() });
        showAddAccount = false;
        const newState = await invoke<UsageState>("get_usage");
        render(newState);
      } catch (e) {
        console.error("Add account failed:", e);
      }
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
