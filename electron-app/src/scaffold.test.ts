import { describe, expect, it } from "vitest";

describe("electron scaffold", () => {
  it("has a working Vitest setup", () => {
    expect("claude-usage-electron").toContain("electron");
  });
});
