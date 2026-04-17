import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

describe("Phase 4 Codex session parser red tests", () => {
  let tempRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(tempRoots.map((root) => rm(root, { force: true, recursive: true })));
    tempRoots = [];
  });

  it("recursively parses rollout JSONL session files and drops raw prompt/session payloads", async () => {
    const sessions = await loadSessions();
    const root = await makeTempRoot();
    const sessionDir = path.join(root, "sessions", "2026", "04", "17");
    await mkdir(sessionDir, { recursive: true });
    await writeFile(
      path.join(sessionDir, "rollout-abc.jsonl"),
      [
        JSON.stringify({
          timestamp: "2026-04-17T14:00:00.000Z",
          type: "turn",
          role: "user",
          content: "do not persist this prompt"
        }),
        JSON.stringify({
          model: "gpt-5.4",
          timestamp: "2026-04-17T14:00:01.000Z",
          token_count: 2048,
          type: "response"
        }),
        JSON.stringify({
          message: "You've hit the local usage limit. Try again at 2:30 PM.",
          timestamp: "2026-04-17T14:01:00.000Z"
        })
      ].join("\n")
    );

    const result = await sessions.parseCodexSessionTree({ rootDir: root });

    expect(result.events).toEqual([
      expect.objectContaining({ model: "gpt-5.4", tokenCount: 2048 }),
      expect.objectContaining({ cooldownUntil: expect.any(String), limitHit: true })
    ]);
    expect(result.filesScanned).toBe(1);
    expect(JSON.stringify(result)).not.toContain("do not persist this prompt");
  });

  it("surfaces malformed JSONL diagnostics without failing the whole scan", async () => {
    const sessions = await loadSessions();
    const root = await makeTempRoot();
    const sessionDir = path.join(root, "sessions", "2026", "04", "17");
    await mkdir(sessionDir, { recursive: true });
    await writeFile(path.join(sessionDir, "rollout-bad.jsonl"), "{ bad json\n");

    const result = await sessions.parseCodexSessionTree({ rootDir: root });

    expect(result.events).toEqual([]);
    expect(result.diagnostics).toEqual(expect.arrayContaining([expect.stringContaining("rollout-bad.jsonl")]));
  });

  async function makeTempRoot(): Promise<string> {
    const root = await mkdtemp(path.join(tmpdir(), "codex-sessions-"));
    tempRoots.push(root);
    return root;
  }
});

async function loadSessions(): Promise<Record<string, any>> {
  const modulePath = "./sessions.js";
  return import(modulePath) as Promise<Record<string, any>>;
}
