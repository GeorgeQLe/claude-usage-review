import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const yaml = require("js-yaml") as { load: (content: string) => unknown };

type BuilderConfig = {
  readonly publish?: unknown;
  readonly mac?: {
    readonly artifactName?: string;
    readonly category?: string;
    readonly icon?: string;
    readonly identity?: unknown;
    readonly hardenedRuntime?: boolean;
    readonly gatekeeperAssess?: boolean;
    readonly publish?: unknown;
    readonly target?: readonly string[];
  };
  readonly win?: {
    readonly artifactName?: string;
    readonly executableName?: string;
    readonly icon?: string;
    readonly requestedExecutionLevel?: string;
    readonly publish?: unknown;
    readonly target?: readonly string[];
  };
  readonly nsis?: {
    readonly artifactName?: string;
    readonly oneClick?: boolean;
    readonly perMachine?: boolean;
    readonly allowToChangeInstallationDirectory?: boolean;
    readonly createDesktopShortcut?: string | boolean;
    readonly createStartMenuShortcut?: boolean;
    readonly shortcutName?: string;
    readonly differentialPackage?: boolean;
    readonly publish?: unknown;
  };
  readonly portable?: {
    readonly artifactName?: string;
    readonly publish?: unknown;
  };
  readonly linux?: {
    readonly artifactName?: string;
    readonly executableName?: string;
    readonly icon?: string;
    readonly target?: readonly string[];
    readonly category?: string;
    readonly packageCategory?: string;
    readonly synopsis?: string;
    readonly description?: string;
    readonly publish?: unknown;
    readonly desktop?: {
      readonly entry?: {
        readonly Name?: string;
        readonly Comment?: string;
        readonly Keywords?: string;
        readonly StartupWMClass?: string;
      };
    };
  };
  readonly appImage?: {
    readonly artifactName?: string;
    readonly category?: string;
    readonly publish?: unknown;
  };
  readonly deb?: {
    readonly artifactName?: string;
    readonly packageName?: string;
    readonly packageCategory?: string;
    readonly priority?: string;
    readonly depends?: readonly string[];
    readonly publish?: unknown;
  };
};

type PackageJson = {
  readonly scripts?: Record<string, string>;
  readonly build?: {
    readonly extends?: string;
  };
};

function readBuilderConfig(): BuilderConfig {
  const configPath = resolve(__dirname, "../electron-builder.yml");
  return yaml.load(readFileSync(configPath, "utf8")) as BuilderConfig;
}

function readPackageJson(): PackageJson {
  const packageJsonPath = resolve(__dirname, "../package.json");
  return JSON.parse(readFileSync(packageJsonPath, "utf8")) as PackageJson;
}

describe("Electron Builder packaging config", () => {
  it("keeps Windows, Linux, and unsigned macOS parity targets configured", () => {
    const config = readBuilderConfig();

    expect(config.publish).toBeNull();
    expect(config.mac).toMatchObject({
      artifactName: "${productName}-${version}-mac-${arch}.${ext}",
      category: "public.app-category.productivity",
      icon: "build/icon.png",
      identity: null,
      hardenedRuntime: false,
      gatekeeperAssess: false,
      target: ["dir"]
    });
    expect(config.win).toMatchObject({
      artifactName: "${productName}-${version}-windows-${arch}.${ext}",
      executableName: "ClaudeUsage",
      icon: "build/icon.ico",
      requestedExecutionLevel: "asInvoker",
      target: ["nsis", "portable"]
    });
    expect(config.linux).toMatchObject({
      artifactName: "${productName}-${version}-linux-${arch}.${ext}",
      executableName: "claude-usage",
      icon: "build/icon.png",
      target: ["AppImage", "deb"],
      category: "Utility",
      packageCategory: "utils"
    });
  });

  it("defines installer/package metadata without signing, publishing, or auto-update settings", () => {
    const config = readBuilderConfig();
    const serialized = JSON.stringify(config).toLowerCase();

    expect(config.nsis).toMatchObject({
      artifactName: "${productName}-${version}-windows-installer-${arch}.${ext}",
      oneClick: false,
      perMachine: false,
      allowToChangeInstallationDirectory: true,
      createDesktopShortcut: "always",
      createStartMenuShortcut: true,
      shortcutName: "ClaudeUsage",
      differentialPackage: false
    });
    expect(config.portable).toMatchObject({
      artifactName: "${productName}-${version}-windows-portable-${arch}.${ext}"
    });
    expect(config.appImage).toMatchObject({
      artifactName: "${productName}-${version}-linux-${arch}.AppImage",
      category: "Utility"
    });
    expect(config.deb).toMatchObject({
      artifactName: "${productName}_${version}_${arch}.deb",
      packageName: "claude-usage",
      packageCategory: "utils",
      priority: "optional"
    });
    expect(config.deb?.depends).toEqual(
      expect.arrayContaining(["libgtk-3-0", "libnotify4", "libsecret-1-0", "xdg-utils"])
    );
    expect(config.linux?.desktop?.entry).toMatchObject({
      Name: "ClaudeUsage",
      Comment: "Monitor Claude, Codex, and Gemini CLI usage",
      Keywords: "Claude;Codex;Gemini;AI;Usage;",
      StartupWMClass: "ClaudeUsage"
    });
    expect(serialized).not.toContain("notarize");
    expect(serialized).not.toContain("autoupdate");
    expect([
      config.mac?.publish,
      config.win?.publish,
      config.nsis?.publish,
      config.portable?.publish,
      config.linux?.publish,
      config.appImage?.publish,
      config.deb?.publish
    ]).toEqual([undefined, undefined, undefined, undefined, undefined, undefined, undefined]);
  });

  it("keeps package scripts aligned with the Windows and Linux packaging gate contract", () => {
    const packageJson = readPackageJson();

    expect(packageJson.build).toEqual({ extends: "./electron-builder.yml" });
    expect(packageJson.scripts).toMatchObject({
      build: "npm run typecheck && npm test -- --run && npm run build:main && npm run build:preload && npm run build:renderer",
      "package:config": "vitest run src/package-config.test.ts",
      "package:host": "npm run build && electron-builder",
      "package:mac:dir": "npm run build && electron-builder --mac dir",
      "package:win": "npm run build && electron-builder --win nsis portable",
      "package:linux": "npm run build && electron-builder --linux AppImage deb",
      "smoke:electron": "node scripts/smoke-electron.mjs"
    });
  });
});
