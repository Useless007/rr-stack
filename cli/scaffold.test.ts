import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ASTRYX, withAstryx } from "./astryx/sync";
import { appPort, buildTemplate, dbPort, isOlder, scaffold, validateName } from "./scaffold";

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

  test("--ssr adds the renderer, a loader route and two-process Docker files, still renamed", async () => {
    const dest = freshDir();
    await scaffold({ name: "demo", dest, source: template, overlays: [join(import.meta.dir, "ssr")] });
    const read = (f: string) => readFileSync(join(dest, f), "utf8");
    expect(read("web/react-router.config.ts")).toContain("ssr: true");
    expect(existsSync(join(dest, "web/server.ts"))).toBeTrue();
    expect(read("web/app/routes/todo.tsx")).toContain("export async function loader");
    const compose = read("compose.yml");
    expect(compose).toContain("WEB_SSR_URL: http://web:3001");
    expect(compose).toContain(`127.0.0.1:${appPort("demo")}:3000`);
    expect(compose).toContain("postgres://demo:demo@db:5432/demo");
    expect(compose).not.toContain("POSTGRES_USER: rr");
    expect(read("Dockerfile")).toContain("bun /app/web/server.ts");
  });

  test("--astryx swaps in the Astryx pages, styles and dependencies, and tells agents", async () => {
    const dest = freshDir();
    await scaffold({
      name: "demo",
      dest,
      source: template,
      overlays: [join(import.meta.dir, "astryx", "files")],
      agentNotes: [join(import.meta.dir, "astryx", "AGENTS.astryx.md")],
    });
    const read = (f: string) => readFileSync(join(dest, f), "utf8");
    const pkg = JSON.parse(read("web/package.json"));
    expect(pkg.name).toBe("demo-web");
    expect(pkg.dependencies["@astryxdesign/core"]).toBe(ASTRYX.dependencies["@astryxdesign/core"]);
    expect(read("web/bun.lock")).toContain("@astryxdesign/core");
    expect(read("web/app/ui.css")).toContain("@layer reset, theme, base, astryx-base");
    expect(read("web/app/components/ui-provider.tsx")).toContain("neutralTheme");
    expect(read("web/app/routes/todos.tsx")).toContain("@astryxdesign/core/List");
    expect(read("AGENTS.md")).toContain("## UI components: Astryx");
    for (const gone of ["sync.ts", "AGENTS.astryx.md", "files"]) expect(existsSync(join(dest, gone))).toBeFalse();
  });

  test("the Astryx overlay's package.json and lockfile match the template's (run bun cli/astryx/sync.ts)", () => {
    const overlay = readFileSync(join(import.meta.dir, "astryx/files/web/package.json"), "utf8");
    expect(overlay).toBe(withAstryx(readFileSync(join(repoRoot, "web/package.json"), "utf8")));
    // Every exact version the template locks (direct or not) is in the Astryx lock too. It may sit
    // one level down (Astryx pulls older @babel/* and commander, so bun hoists those instead).
    const versions = (file: string) =>
      new Set([...readFileSync(file, "utf8").matchAll(/\n {4}"[^"]+": \["([^"]+)"/g)].map((m) => m[1]!));
    const templateLock = versions(join(repoRoot, "web/bun.lock"));
    const astryxLock = versions(join(import.meta.dir, "astryx/files/web/bun.lock"));
    expect(templateLock.size).toBeGreaterThan(100);
    expect([...templateLock].filter((v) => !astryxLock.has(v))).toEqual([]);
  });

  test("--ssr and --astryx together: Astryx pages, the SSR loader route and renderer", async () => {
    const dest = freshDir();
    await scaffold({ name: "demo", dest, source: template, overlays: [join(import.meta.dir, "ssr"), join(import.meta.dir, "astryx", "files")] });
    const read = (f: string) => readFileSync(join(dest, f), "utf8");
    expect(read("web/app/routes/todo.tsx")).toContain("export async function loader");
    expect(read("web/app/components/todo-page.tsx")).toContain("@astryxdesign/core");
    expect(existsSync(join(dest, "web/server.ts"))).toBeTrue();
    expect(read("web/react-router.config.ts")).toContain("ssr: true");
  });

  test("without --ssr the project is prerender + SPA", async () => {
    const dest = freshDir();
    await scaffold({ name: "demo", dest, source: template });
    expect(readFileSync(join(dest, "web/react-router.config.ts"), "utf8")).toContain("ssr: false");
    expect(existsSync(join(dest, "web/server.ts"))).toBeFalse();
    expect(readFileSync(join(dest, "compose.yml"), "utf8")).not.toContain("WEB_SSR_URL");
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

  test("gives each project its own database name and ports", async () => {
    const dest = freshDir();
    await scaffold({ name: "my-app", dest, source: template });
    const port = dbPort("my-app");
    expect(port).toBeGreaterThanOrEqual(54000);
    expect(port).toBeLessThan(55000);
    expect(appPort("my-app")).toBe(port + 1000);
    const compose = readFileSync(join(dest, "compose.yml"), "utf8");
    expect(compose).toContain("POSTGRES_DB: my_app");
    expect(compose).toContain(`127.0.0.1:${port}:5432`);
    expect(compose).toContain("postgres://my_app:my_app@db:5432/my_app");
    expect(compose).toContain(`127.0.0.1:${appPort("my-app")}:3000`);
    expect(compose).toContain(`http://localhost:${appPort("my-app")}`);
    expect(compose).not.toMatch(/\brr\b/);
    const env = readFileSync(join(dest, ".env"), "utf8");
    expect(env).toContain(`postgres://my_app:my_app@localhost:${port}/my_app`);
    expect(dbPort("other")).not.toBe(port);
  });

  test("the copied CI workflow names nothing from the template", async () => {
    const dest = freshDir();
    await scaffold({ name: "my-app", dest, source: template });
    const ci = readFileSync(join(dest, ".github/workflows/ci.yml"), "utf8");
    expect(ci).not.toContain("rr:rr");
    expect(ci).not.toContain("localhost:5432/rr");
  });

  test("gives a project its own README, not the repo's contributor docs", async () => {
    const dest = freshDir();
    await scaffold({ name: "demo", dest, source: template });
    for (const gone of ["CONTRIBUTING.md", "README.th.md", "README.zh-CN.md", "README.ja.md", "LICENSE", "CHANGELOG.md", "SECURITY.md", ".github/ISSUE_TEMPLATE", ".github/pull_request_template.md"]) {
      expect(existsSync(join(dest, gone))).toBeFalse();
    }
    const readme = readFileSync(join(dest, "README.md"), "utf8");
    expect(readme).toContain("bun run dev");
    expect(readme).not.toContain("Contributing");
  });

  test("titles the README with the project name", async () => {
    const dest = freshDir();
    await scaffold({ name: "my-app", dest, source: template });
    const readme = readFileSync(join(dest, "README.md"), "utf8");
    expect(readme.split("\n")[0]).toBe("# my-app");
    expect(readme).toContain("bun create rr-stack");
  });

});

describe("isOlder", () => {
  test.each([
    ["0.3.1", "0.3.2", true],
    ["0.3.2", "0.10.0", true],
    ["0.9.9", "1.0.0", true],
    ["0.3.2", "0.3.2", false],
    ["0.4.0", "0.3.9", false],
    ["0.3.2", "not-a-version", false],
  ])("%p older than %p is %p", (a, b, want) => {
    expect(isOlder(a, b)).toBe(want);
  });
});

describe("update notice", () => {
  // Async spawn: spawnSync would block the event loop this fake registry answers on.
  const runAgainst = async (latest: string | null | "hang") => {
    const server = Bun.serve({
      port: 0,
      idleTimeout: 0,
      fetch: () =>
        latest === "hang"
          ? new Promise<Response>(() => {})
          : latest
            ? Response.json({ version: latest })
            : new Response("down", { status: 503 }),
    });
    const cwd = mkdtempSync(join(tmpdir(), "rr-run-"));
    const proc = Bun.spawn([process.execPath, join(import.meta.dir, "index.ts"), "demo", "--no-install", "--no-git"], {
      cwd,
      env: { ...process.env, npm_config_registry: `http://localhost:${server.port}/` },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [code, out, err] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
    server.stop(true);
    return { code, out: out + err };
  };

  test("says how to get a newer version when npm has one", async () => {
    const { code, out } = await runAgainst("99.0.0");
    expect(code).toBe(0);
    expect(out).toContain("99.0.0");
    expect(out).toContain("bun create rr-stack@latest demo");
  });


  test("does not wait long for a registry that never answers", async () => {
    const started = performance.now();
    const { code, out } = await runAgainst("hang");
    expect(code).toBe(0);
    expect(out).not.toContain("@latest");
    expect(performance.now() - started).toBeLessThan(6000);
  }, 10_000);

  test("refuses conflicting and unknown options before creating anything", () => {
    for (const args of [["--ssr", "--spa"], ["--astryx", "--tailwind"], ["--astyrx"]]) {
      const cwd = mkdtempSync(join(tmpdir(), "rr-run-"));
      const res = Bun.spawnSync([process.execPath, join(import.meta.dir, "index.ts"), "demo", "--yes", ...args], { cwd });
      expect(res.exitCode).toBe(1);
      expect(existsSync(join(cwd, "demo"))).toBeFalse();
    }
  });

  test("keeps the flags the user typed in the suggested command", async () => {
    const { out } = await runAgainst("99.0.0");
    expect(out).toContain("bun create rr-stack@latest demo --no-install --no-git");
  });

  test("stays quiet when the registry is unreachable", async () => {
    const { code, out } = await runAgainst(null);
    expect(code).toBe(0);
    expect(out).not.toContain("@latest");
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

  test("never deletes a folder that was already there", () => {
    const cwd = mkdtempSync(join(tmpdir(), "rr-run-"));
    mkdirSync(join(cwd, "mine"));
    writeFileSync(join(cwd, "mine", "keep.txt"), "mine");
    const res = Bun.spawnSync([process.execPath, join(import.meta.dir, "index.ts"), "mine", "--yes"], { cwd });
    expect(res.exitCode).toBe(1);
    expect(readFileSync(join(cwd, "mine", "keep.txt"), "utf8")).toBe("mine");
  });
});

describe("npm README", () => {
  // npm resolves relative links against repository.directory (cli/), where these files do not exist.
  test("README.md has no relative links", () => {
    const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
    expect(readme.match(/(\]\(|href=")(?!https?:|#)[^)"]+/g) ?? []).toEqual([]);
  });
});

describe("npm package", () => {
  // npm ignores the global gitignore, so stray local state (e.g. an agent's .omc/) would ship.
  test("ships only files tracked by git, plus what prepack generates", () => {
    const pack = Bun.spawnSync(["npm", "pack", "--dry-run", "--ignore-scripts", "--json"], { cwd: import.meta.dir });
    const files: string[] = Object.values(JSON.parse(pack.stdout.toString()) as Record<string, { files: { path: string }[] }>)[0]!.files.map((f) => f.path);
    const tracked = new Set(Bun.spawnSync(["git", "ls-files"], { cwd: import.meta.dir }).stdout.toString().trim().split("\n"));
    const generated = (f: string) => f.startsWith("template/") || ["package.json", "LICENSE", "README.md"].includes(f);
    expect(files.filter((f) => !generated(f) && !tracked.has(f))).toEqual([]);
  });
});
