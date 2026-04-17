import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

describe("Phase 4 Codex detector red tests", () => {
  let tempRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(tempRoots.map((root) => rm(root, { force: true, recursive: true })));
    tempRoots = [];
  });

  it("resolves CODEX_HOME with a ~/.codex fallback and detects install/auth presence", async () => {
    const detector = await loadDetector();
    const home = await makeTempRoot();
    const codexHome = path.join(home, ".codex");
    await mkdir(codexHome, { recursive: true });
    await writeFile(path.join(codexHome, "config.toml"), 'model = "gpt-5.4"\n');
    await writeFile(
      path.join(codexHome, "auth.json"),
      JSON.stringify({
        accounts: [{ email: "user@example.com" }],
        access_token: "codex-secret-token",
        cookies: "codex-cookie"
      })
    );

    expect(detector.resolveCodexHome({ env: {}, homeDir: home })).toBe(codexHome);
    const result = await detector.detectCodexInstall({ env: {}, homeDir: home });

    expect(result).toMatchObject({
      auth: {
        accountLabel: "user@example.com",
        configured: true
      },
      detected: true,
      installPath: codexHome
    });
    expect(JSON.stringify(result)).not.toContain("codex-secret-token");
    expect(JSON.stringify(result)).not.toContain("codex-cookie");
  });

  it("treats missing config or auth files as degraded but privacy-safe diagnostics", async () => {
    const detector = await loadDetector();
    const home = await makeTempRoot();

    const result = await detector.detectCodexInstall({ env: {}, homeDir: home });

    expect(result).toMatchObject({
      detected: false,
      diagnostics: expect.arrayContaining([expect.stringContaining("not found")])
    });
    expect(JSON.stringify(result)).not.toContain("auth.json");
  });

  async function makeTempRoot(): Promise<string> {
    const root = await mkdtemp(path.join(tmpdir(), "codex-detector-"));
    tempRoots.push(root);
    return root;
  }
});

async function loadDetector(): Promise<Record<string, any>> {
  const modulePath = "./detector.js";
  return import(modulePath) as Promise<Record<string, any>>;
}
