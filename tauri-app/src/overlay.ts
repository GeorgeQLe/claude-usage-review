import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { UsageState } from "./types";
import { createCircleProgress, getColor } from "./components/circle-progress";

const app = document.getElementById("app")!;
const appWindow = getCurrentWebviewWindow();

let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;

async function init() {
  // Get initial layout from config
  const config = await invoke<{ overlay_layout: string; overlay_opacity: number }>("get_config");
  document.body.style.opacity = String(config.overlay_opacity);

  const state = await invoke<UsageState>("get_usage");
  render(state, config.overlay_layout);

  await listen<UsageState>("usage-updated", (event) => {
    render(event.payload, config.overlay_layout);
  });

  // Dragging
  document.addEventListener("mousedown", (e) => {
    isDragging = true;
    dragStartX = e.screenX;
    dragStartY = e.screenY;
  });

  document.addEventListener("mousemove", async (e) => {
    if (!isDragging) return;
    const dx = e.screenX - dragStartX;
    const dy = e.screenY - dragStartY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      dragStartX = e.screenX;
      dragStartY = e.screenY;
      const pos = await appWindow.outerPosition();
      const newX = pos.x + dx;
      const newY = pos.y + dy;
      await appWindow.setPosition(
        new (await import("@tauri-apps/api/dpi")).PhysicalPosition(newX, newY)
      );
    }
  });

  document.addEventListener("mouseup", async () => {
    if (isDragging) {
      isDragging = false;
      const pos = await appWindow.outerPosition();
      await invoke("set_overlay_position", { x: pos.x, y: pos.y });
    }
  });

  // Click opens popover (main window)
  document.addEventListener("dblclick", async () => {
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    new WebviewWindow("popover", {
      url: "index.html",
      title: "Claude Usage",
      width: 280,
      height: 400,
      decorations: false,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      focus: true,
    });
  });

  // Right-click context: hide
  document.addEventListener("contextmenu", async (e) => {
    e.preventDefault();
    await invoke("toggle_overlay");
  });
}

function render(state: UsageState, layout: string) {
  if (state.display_limits.length === 0) {
    app.innerHTML = '<div class="overlay-minimal" style="color: var(--text-muted)">--</div>';
    return;
  }

  const session = state.display_limits.find((l) => l.name === "Session");
  const weekly = state.display_limits.find((l) => l.name === "Weekly");

  switch (layout) {
    case "compact":
      renderCompact(session, weekly);
      break;
    case "minimal":
      renderMinimal(state, session, weekly);
      break;
    case "sidebar":
      renderSidebar(state);
      break;
    default:
      renderCompact(session, weekly);
  }
}

function renderCompact(
  session: UsageState["display_limits"][0] | undefined,
  weekly: UsageState["display_limits"][0] | undefined
) {
  let html = '<div class="overlay-compact">';

  if (session) {
    html += `
      <div class="overlay-item">
        ${createCircleProgress(session.utilization, 24)}
        <span>${Math.round(session.utilization)}%</span>
      </div>
    `;
  }

  if (weekly) {
    const paceArrow = weekly.pace_detail?.match(/[▲▼]/)?.[0] || "";
    html += `
      <div class="overlay-item">
        ${createCircleProgress(weekly.utilization, 24)}
        <span>${Math.round(weekly.utilization)}%W${paceArrow}</span>
      </div>
    `;
  }

  if (session?.reset_time_display) {
    const timeOnly = session.reset_time_display.replace("Resets at ", "").replace(/Resets \w+ /, "");
    html += `<span class="overlay-reset">${timeOnly}</span>`;
  }

  html += "</div>";
  app.innerHTML = html;
}

function renderMinimal(
  state: UsageState,
  session: UsageState["display_limits"][0] | undefined,
  weekly: UsageState["display_limits"][0] | undefined
) {
  const sessionPct = session ? Math.round(session.utilization) : 0;
  const weeklyPct = weekly ? Math.round(weekly.utilization) : 0;
  const paceArrow = weekly?.pace_detail?.match(/[▲▼]/)?.[0] || "";
  const timeOnly = session?.reset_time_display
    ?.replace("Resets at ", "")
    .replace(/Resets \w+ /, "") || "";

  const color = getColor(state.highest_utilization);

  app.innerHTML = `
    <div class="overlay-minimal" style="color: ${color}">
      ${sessionPct}% · ${weeklyPct}%W${paceArrow} · ${timeOnly}
    </div>
  `;
}

function renderSidebar(state: UsageState) {
  let html = '<div class="overlay-sidebar">';

  for (const limit of state.display_limits) {
    const color = getColor(limit.utilization);
    const pct = Math.round(limit.utilization);

    html += `
      <div class="sidebar-item">
        <span class="sidebar-label">${limit.name}</span>
        <div class="sidebar-bar">
          <div class="sidebar-fill" style="width: ${Math.min(pct, 100)}%; background: ${color}"></div>
        </div>
        <span class="sidebar-pct" style="color: ${color}">${pct}%</span>
      </div>
    `;
  }

  html += "</div>";
  app.innerHTML = html;
}

init();
