import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { scaffold, validateName } from "./scaffold";

const repoRoot = resolve(import.meta.dir, "..");
const freshDir = () => join(mkdtempSync(join(tmpdir(), "rr-cli-")), "out");

describe("validateName", () => {
  test("accepts lowercase names with dashes", () => {
    expect(validateName("my-app")).toBeNull();
  });
  test.each(["My-App", "1app", "app-", "a b", ""])("rejects %p", (name) => {
    expect(validateName(name)).toBeString();
  });
});

describe("scaffold", () => {
  test("copies the template under the new name", async () => {
    const dest = freshDir();
    await scaffold({ name: "demo", dest, source: repoRoot });
    expect(readFileSync(join(dest, "server/Cargo.toml"), "utf8")).toContain('name = "demo-server"');
    expect(JSON.parse(readFileSync(join(dest, "web/package.json"), "utf8")).name).toBe("demo-web");
    expect(existsSync(join(dest, ".env"))).toBeTrue();
    for (const gone of ["cli", "docs", "server/target", "web/node_modules", "web/build", ".git"]) {
      expect(existsSync(join(dest, gone))).toBeFalse();
    }
    for (const kept of ["openapi.json", "server/.sqlx", "web/app/api/sdk.gen.ts", "AGENTS.md"]) {
      expect(existsSync(join(dest, kept))).toBeTrue();
    }
    expect(statSync(join(dest, "scripts/check.sh")).mode & 0o111).not.toBe(0);
  });

  test("refuses a non-empty destination and leaves it untouched", async () => {
    const dest = freshDir();
    await Bun.write(join(dest, "keep.txt"), "mine");
    await expect(scaffold({ name: "demo", dest, source: repoRoot })).rejects.toThrow(/not empty/);
    expect(readFileSync(join(dest, "keep.txt"), "utf8")).toBe("mine");
    expect(existsSync(join(dest, "server"))).toBeFalse();
  });
});
