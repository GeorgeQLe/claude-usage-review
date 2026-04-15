import type { ClaudeUsageApi } from "../preload/api.js";

declare global {
  interface Window {
    readonly claudeUsage: ClaudeUsageApi;
  }
}

export {};
