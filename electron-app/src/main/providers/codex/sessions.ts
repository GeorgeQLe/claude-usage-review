import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { parseCodexHistoryLine } from "./history.js";
import type { CodexDerivedEvent } from "./history.js";
import type { Dirent } from "node:fs";

export interface ParseCodexSessionTreeInput {
  readonly rootDir: string;
}

export interface ParseCodexSessionTreeResult {
  readonly events: readonly CodexDerivedEvent[];
  readonly diagnostics: readonly string[];
  readonly filesScanned: number;
}

export async function parseCodexSessionTree(input: ParseCodexSessionTreeInput): Promise<ParseCodexSessionTreeResult> {
  const sessionsRoot = path.join(input.rootDir, "sessions");
  const diagnostics: string[] = [];
  const events: CodexDerivedEvent[] = [];
  let filesScanned = 0;

  for (const filePath of await listRolloutFiles(sessionsRoot)) {
    filesScanned += 1;
    const parsed = await parseSessionFile(filePath);
    events.push(...parsed.events);
    diagnostics.push(...parsed.diagnostics);
  }

  return {
    events,
    diagnostics,
    filesScanned
  };
}

async function parseSessionFile(filePath: string): Promise<{
  readonly events: readonly CodexDerivedEvent[];
  readonly diagnostics: readonly string[];
}> {
  const diagnostics: string[] = [];
  const events: CodexDerivedEvent[] = [];

  try {
    const text = await readFile(filePath, "utf8");
    for (const line of text.split(/\r?\n/u)) {
      if (!line.trim()) {
        continue;
      }

      try {
        const event = parseCodexHistoryLine(JSON.parse(line), "session-jsonl");
        if (event) {
          events.push(event);
        }
      } catch {
        diagnostics.push(`${path.basename(filePath)} contained malformed JSONL.`);
      }
    }
  } catch {
    diagnostics.push(`${path.basename(filePath)} could not be read.`);
  }

  return { events, diagnostics };
}

async function listRolloutFiles(rootDir: string): Promise<readonly string[]> {
  const files: string[] = [];

  async function walk(currentDir: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
        continue;
      }

      if (entry.isFile() && /^rollout-.*\.jsonl$/u.test(entry.name)) {
        files.push(entryPath);
      }
    }
  }

  await walk(rootDir);
  return files.sort();
}
