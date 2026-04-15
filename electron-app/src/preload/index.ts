import { contextBridge } from "electron";
import { createClaudeUsageApi } from "./api.js";

contextBridge.exposeInMainWorld("claudeUsage", Object.freeze(createClaudeUsageApi()));
