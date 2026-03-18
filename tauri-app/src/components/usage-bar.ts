import { DisplayLimit } from "../types";
import { createCircleProgress, getColor } from "./circle-progress";

export function createUsageBar(limit: DisplayLimit): string {
  const pct = Math.round(limit.utilization);
  const color = getColor(limit.utilization);

  return `
    <div class="usage-bar">
      <div class="usage-bar-header">
        <div class="usage-bar-label">
          <span class="usage-bar-name">${limit.name}</span>
          ${createCircleProgress(limit.utilization, 20)}
        </div>
        <span class="usage-bar-pct" style="color: ${color}">${pct}%</span>
      </div>
      <div class="usage-bar-track">
        <div class="usage-bar-fill" style="width: ${Math.min(pct, 100)}%; background: ${color}"></div>
      </div>
      ${limit.reset_time_display ? `<div class="usage-bar-reset">${limit.reset_time_display}</div>` : ""}
      ${limit.pace_detail ? `<div class="usage-bar-pace">${limit.pace_detail}</div>` : ""}
    </div>
  `;
}
