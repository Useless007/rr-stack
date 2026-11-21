import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildTemplate, dbPort, scaffold, validateName } from "./scaffold";

const repoRoot = resolve(import.meta.dir, "..");
const freshDir = () => join(mkdtempSync(join(tmpdir(), "rr-cli-")), "out");
// What the npm package ships: the CLI copies from this, never from a git checkout.
const template = freshDir();
await buildTemplate(repoRoot, template);

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
    await scaffold({ name: "demo", dest, source: template });
    expect(readFileSync(join(dest, "server/Cargo.toml"), "utf8")).toContain('name = "demo-server"');
    expect(JSON.parse(readFileSync(join(dest, "web/package.json"), "utf8")).name).toBe("demo-web");
    expect(existsSync(join(dest, ".env"))).toBeTrue();
    for (const gone of ["cli", "docs", "server/target", "web/node_modules", "web/build", ".git"]) {
      expect(existsSync(join(dest, gone))).toBeFalse();
    }
    for (const kept of ["openapi.json", "server/.sqlx", "web/app/api/sdk.gen.ts", "AGENTS.md"]) {
      expect(existsSync(join(dest, kept))).toBeTrue();
    }
    expect(JSON.parse(readFileSync(join(dest, "package.json"), "utf8")).name).toBe("demo");
    expect(existsSync(join(dest, "scripts/check.ts"))).toBeTrue();
  });

  test("refuses a non-empty destination and leaves it untouched", async () => {
    const dest = freshDir();
    await Bun.write(join(dest, "keep.txt"), "mine");
    await expect(scaffold({ name: "demo", dest, source: template })).rejects.toThrow(/not empty/);
    expect(readFileSync(join(dest, "keep.txt"), "utf8")).toBe("mine");
    expect(existsSync(join(dest, "server"))).toBeFalse();
  });

  test("template holds only files git tracks, so local junk and secrets stay behind", async () => {
    const clone = join(mkdtempSync(join(tmpdir(), "rr-src-")), "src");
    Bun.spawnSync(["git", "clone", "-q", repoRoot, clone]);
    writeFileSync(join(clone, ".env.local"), "SECRET=1");
    mkdirSync(join(clone, ".codegraph"));
    writeFileSync(join(clone, ".codegraph/index"), "x");
    const out = freshDir();
    await buildTemplate(clone, out);
    expect(existsSync(join(out, ".env.local"))).toBeFalse();
    expect(existsSync(join(out, ".codegraph"))).toBeFalse();
    expect(existsSync(join(out, "cli"))).toBeFalse();
  });

  test("survives npm dropping .gitignore files from the package", async () => {
    expect(existsSync(join(template, ".gitignore"))).toBeFalse();
    expect(existsSync(join(template, "_gitignore"))).toBeTrue();
    const dest = freshDir();
    await scaffold({ name: "demo", dest, source: template });
    expect(readFileSync(join(dest, ".gitignore"), "utf8")).toContain(".env");
    expect(existsSync(join(dest, "web/.gitignore"))).toBeTrue();
    expect(existsSync(join(dest, "_gitignore"))).toBeFalse();
  });

  test("renames the package in Cargo.lock so cargo build --locked works", async () => {
    const dest = freshDir();
    await scaffold({ name: "demo", dest, source: template });
    const lock = readFileSync(join(dest, "server/Cargo.lock"), "utf8");
    expect(lock).toContain('name = "demo-server"');
    expect(lock).not.toContain('name = "rr-server"');
  });

  test("gives each project its own database name and port", async () => {
    const dest = freshDir();
    await scaffold({ name: "my-app", dest, source: template });
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

  test("titles the README with the project name", async () => {
    const dest = freshDir();
    await scaffold({ name: "my-app", dest, source: template });
    const readme = readFileSync(join(dest, "README.md"), "utf8");
    expect(readme.split("\n")[0]).toBe("# my-app");
    expect(readme).toContain("bun create rr-stack");
  });

});

describe("create-rr-stack (non-interactive)", () => {
  test("creates a project from flags and prints the next steps", () => {
    const cwd = mkdtempSync(join(tmpdir(), "rr-run-"));
    const res = Bun.spawnSync([process.execPath, join(import.meta.dir, "index.ts"), "demo", "--no-install", "--no-git"], { cwd });
    const out = res.stdout.toString();
    expect(res.exitCode).toBe(0);
    expect(out).toContain("Success!");
    expect(out).toContain("bun run dev");
    expect(existsSync(join(cwd, "demo", "server/Cargo.toml"))).toBeTrue();
  });

  test("rejects a bad name with exit 1", () => {
    const cwd = mkdtempSync(join(tmpdir(), "rr-run-"));
    const res = Bun.spawnSync([process.execPath, join(import.meta.dir, "index.ts"), "Bad_Name", "--no-install", "--no-git"], { cwd });
    expect(res.exitCode).toBe(1);
    expect(existsSync(join(cwd, "Bad_Name"))).toBeFalse();
  });
});
