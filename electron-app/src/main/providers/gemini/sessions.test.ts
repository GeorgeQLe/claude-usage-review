import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

describe("Phase 4 Gemini session parser red tests", () => {
  let tempRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(tempRoots.map((root) => rm(root, { force: true, recursive: true })));
    tempRoots = [];
  });

  it("parses tmp chat sessions for model, token, timestamp, rpm, and daily request windows", async () => {
    const sessions = await loadSessions();
    const root = await makeTempRoot();
    const chatDir = path.join(root, "tmp", "abc", "chats");
    await mkdir(chatDir, { recursive: true });
    await writeFile(
      path.join(chatDir, "session-1.json"),
      JSON.stringify({
        messages: [
          { role: "user", text: "do not persist gemini prompt", timestamp: "2026-04-17T14:00:00.000Z" },
          {
            model: "gemini-2.5-pro",
            role: "model",
            timestamp: "2026-04-17T14:00:10.000Z",
            usage: { inputTokens: 100, outputTokens: 250 }
          },
          {
            model: "gemini-2.5-pro",
            role: "model",
            timestamp: "2026-04-17T14:00:40.000Z",
            usage: { inputTokens: 50, outputTokens: 75 }
          }
        ]
      })
    );

    const result = await sessions.parseGeminiSessionTree({
      now: new Date("2026-04-17T14:01:00.000Z"),
      rootDir: root
    });

    expect(result.summary).toMatchObject({
      dailyRequestCount: 2,
      model: "gemini-2.5-pro",
      requestsPerMinute: 2,
      tokenCount: 475
    });
    expect(JSON.stringify(result)).not.toContain("do not persist gemini prompt");
  });

  it("tolerates malformed session JSON and omits raw chat bodies from diagnostics", async () => {
    const sessions = await loadSessions();
    const root = await makeTempRoot();
    const chatDir = path.join(root, "tmp", "abc", "chats");
    await mkdir(chatDir, { recursive: true });
    await writeFile(path.join(chatDir, "session-bad.json"), "{ bad json");

    const result = await sessions.parseGeminiSessionTree({ now: new Date("2026-04-17T14:01:00.000Z"), rootDir: root });

    expect(result.summary.dailyRequestCount).toBe(0);
    expect(result.diagnostics).toEqual(expect.arrayContaining([expect.stringContaining("session-bad.json")]));
    expect(JSON.stringify(result)).not.toContain("{ bad json");
  });

  async function makeTempRoot(): Promise<string> {
    const root = await mkdtemp(path.join(tmpdir(), "gemini-sessions-"));
    tempRoots.push(root);
    return root;
  }
});

async function loadSessions(): Promise<Record<string, any>> {
  const modulePath = "./sessions.js";
  return import(modulePath) as Promise<Record<string, any>>;
}
