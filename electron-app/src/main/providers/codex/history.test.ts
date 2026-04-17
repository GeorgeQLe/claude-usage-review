import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

describe("Phase 4 Codex history red tests", () => {
  let tempRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(tempRoots.map((root) => rm(root, { force: true, recursive: true })));
    tempRoots = [];
  });

  it("parses history.jsonl incrementally with byte-offset bookmarks and prompt redaction", async () => {
    const history = await loadHistory();
    const root = await makeTempRoot();
    const historyPath = path.join(root, "history.jsonl");
    await writeFile(
      historyPath,
      [
        JSON.stringify({
          cwd: "/repo",
          model: "gpt-5.4",
          prompt: "secret product roadmap prompt",
          timestamp: "2026-04-17T13:00:00.000Z"
        }),
        "{ malformed json",
        JSON.stringify({
          limit_hit: true,
          message: "rate limit exceeded, try again in 12 minutes",
          timestamp: "2026-04-17T13:03:00.000Z"
        })
      ].join("\n")
    );

    const result = await history.parseCodexHistory({
      bookmark: { byteOffset: 0 },
      historyPath
    });

    expect(result.bookmark.byteOffset).toBeGreaterThan(0);
    expect(result.events).toEqual([
      expect.objectContaining({ model: "gpt-5.4", source: "history-jsonl" }),
      expect.objectContaining({ cooldownUntil: expect.any(String), limitHit: true })
    ]);
    expect(result.diagnostics).toEqual(expect.arrayContaining([expect.stringContaining("malformed")]));
    expect(JSON.stringify(result)).not.toContain("secret product roadmap prompt");
  });

  it("continues from the previous bookmark without replaying old entries", async () => {
    const history = await loadHistory();
    const root = await makeTempRoot();
    const historyPath = path.join(root, "history.jsonl");
    const firstLine = `${JSON.stringify({ timestamp: "2026-04-17T13:00:00.000Z" })}\n`;
    await writeFile(historyPath, `${firstLine}${JSON.stringify({ timestamp: "2026-04-17T13:05:00.000Z" })}\n`);

    const result = await history.parseCodexHistory({
      bookmark: { byteOffset: Buffer.byteLength(firstLine) },
      historyPath
    });

    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ occurredAt: "2026-04-17T13:05:00.000Z" });
  });

  async function makeTempRoot(): Promise<string> {
    const root = await mkdtemp(path.join(tmpdir(), "codex-history-"));
    tempRoots.push(root);
    return root;
  }
});

async function loadHistory(): Promise<Record<string, any>> {
  const modulePath = "./history.js";
  return import(modulePath) as Promise<Record<string, any>>;
}
