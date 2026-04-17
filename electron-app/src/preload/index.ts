import { contextBridge } from "electron";
import { createClaudeUsageApi } from "./api.js";

contextBridge.exposeInMainWorld("claudeUsage", Object.freeze(createClaudeUsageApi()));

if (process.env.CLAUDE_USAGE_ELECTRON_SMOKE === "1") {
  contextBridge.exposeInMainWorld("__CLAUDE_USAGE_SMOKE__", true);
}
