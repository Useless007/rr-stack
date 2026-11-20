import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { dbPort, scaffold, validateName } from "./scaffold";

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

  test("copies only files git tracks, so local junk and secrets stay behind", async () => {
    const clone = join(mkdtempSync(join(tmpdir(), "rr-src-")), "src");
    Bun.spawnSync(["git", "clone", "-q", repoRoot, clone]);
    writeFileSync(join(clone, ".env.local"), "SECRET=1");
    mkdirSync(join(clone, ".codegraph"));
    writeFileSync(join(clone, ".codegraph/index"), "x");
    const dest = freshDir();
    await scaffold({ name: "demo", dest, source: clone });
    expect(existsSync(join(dest, ".env.local"))).toBeFalse();
    expect(existsSync(join(dest, ".codegraph"))).toBeFalse();
    expect(existsSync(join(dest, "server/src/lib.rs"))).toBeTrue();
  });

  test("gives each project its own database name and port", async () => {
    const dest = freshDir();
    await scaffold({ name: "my-app", dest, source: repoRoot });
    const port = dbPort("my-app");
    expect(port).toBeGreaterThanOrEqual(54000);
    expect(port).toBeLessThan(55000);
    const compose = readFileSync(join(dest, "compose.yml"), "utf8");
    expect(compose).toContain("POSTGRES_DB: my_app");
    expect(compose).toContain(`127.0.0.1:${port}:5432`);
    expect(compose).not.toContain(": rr\n");
    const env = readFileSync(join(dest, ".env"), "utf8");
    expect(env).toContain(`postgres://my_app:my_app@localhost:${port}/my_app`);
    expect(dbPort("my-app")).toBe(port);
    expect(dbPort("other")).not.toBe(port);
  });
});
