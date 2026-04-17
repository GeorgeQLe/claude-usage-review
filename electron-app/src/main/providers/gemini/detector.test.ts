import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

describe("Phase 4 Gemini detector red tests", () => {
  let tempRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(tempRoots.map((root) => rm(root, { force: true, recursive: true })));
    tempRoots = [];
  });

  it("resolves GEMINI_HOME with a ~/.gemini fallback and reports auth mode without secrets", async () => {
    const detector = await loadDetector();
    const home = await makeTempRoot();
    const geminiHome = path.join(home, ".gemini");
    await mkdir(geminiHome, { recursive: true });
    await writeFile(path.join(geminiHome, "settings.json"), JSON.stringify({ authMode: "oauth-personal" }));
    await writeFile(
      path.join(geminiHome, "oauth_creds.json"),
      JSON.stringify({ access_token: "gemini-secret-token", refresh_token: "gemini-refresh-token" })
    );

    expect(detector.resolveGeminiHome({ env: {}, homeDir: home })).toBe(geminiHome);
    const result = await detector.detectGeminiInstall({ env: {}, homeDir: home });

    expect(result).toMatchObject({
      auth: {
        configured: true,
        mode: "oauth-personal"
      },
      detected: true,
      installPath: geminiHome
    });
    expect(JSON.stringify(result)).not.toContain("gemini-secret-token");
    expect(JSON.stringify(result)).not.toContain("gemini-refresh-token");
  });

  it("reports unknown auth modes as degraded diagnostics instead of leaking raw settings", async () => {
    const detector = await loadDetector();
    const home = await makeTempRoot();
    const geminiHome = path.join(home, ".gemini");
    await mkdir(geminiHome, { recursive: true });
    await writeFile(path.join(geminiHome, "settings.json"), JSON.stringify({ authMode: "strange-mode" }));

    const result = await detector.detectGeminiInstall({ env: {}, homeDir: home });

    expect(result).toMatchObject({
      degraded: true,
      diagnostics: expect.arrayContaining([expect.stringContaining("unknown auth mode")])
    });
    expect(JSON.stringify(result)).not.toContain("strange-mode");
  });

  async function makeTempRoot(): Promise<string> {
    const root = await mkdtemp(path.join(tmpdir(), "gemini-detector-"));
    tempRoots.push(root);
    return root;
  }
});

async function loadDetector(): Promise<Record<string, any>> {
  const modulePath = "./detector.js";
  return import(modulePath) as Promise<Record<string, any>>;
}
