import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("claudeUsage", {
  version: "0.1.0"
});
