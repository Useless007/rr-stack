import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/** Returns null when the name is usable as a directory, Cargo package and npm package; else why not. */
export function validateName(name: string): string | null {
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(name)) {
    return "use lowercase letters, digits and dashes, starting with a letter (max 64)";
  }
  if (name.endsWith("-")) return "must not end with a dash";
  return null;
}

/** A stable host port in 54000..54999 so two projects' databases can run side by side. */
export function dbPort(name: string): number {
  let hash = 0x811c9dc5;
  for (const ch of name) hash = Math.imul(hash ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return 54000 + (hash % 1000);
}

/** Host port for `docker compose up`: next to the database port, so the pair is easy to spot. */
export function appPort(name: string): number {
  return dbPort(name) + 1000;
}

/** True when version a is older than b. Anything that is not plain x.y.z compares as not older. */
export function isOlder(a: string, b: string): boolean {
  const parse = (v: string) => (/^\d+\.\d+\.\d+$/.test(v) ? v.split(".").map(Number) : null);
  const [x, y] = [parse(a), parse(b)];
  if (!x || !y) return false;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i]! < y[i]!;
  return false;
}

/** The newest published version, or null when the registry does not answer within a moment. */
export async function latestVersion(registry = process.env.npm_config_registry || "https://registry.npmjs.org/"): Promise<string | null> {
  try {
    const res = await fetch(new URL("create-rr-stack/latest", registry.endsWith("/") ? registry : `${registry}/`), {
      signal: AbortSignal.timeout(1500),
    });
    const body = res.ok ? ((await res.json()) as { version?: unknown }) : null;
    return typeof body?.version === "string" ? body.version : null;
  } catch {
    return null;
  }
}

// Tracked in the template repo but not part of a new project: the CLI, and the repo's own
// docs for contributors (README in every language, CONTRIBUTING, the template's license).
const SKIP_TOP = new Set(["cli", "docs", "CONTRIBUTING.md", "LICENSE", "CHANGELOG.md", "SECURITY.md"]);
const SKIP_PATHS = [".github/ISSUE_TEMPLATE/", ".github/pull_request_template.md", ".github/workflows/demo-reset.yml"];
const isRepoReadme = (file: string) => /^README(\.[\w-]+)?\.md$/.test(file);
// npm never ships files named .gitignore, so the template stores them under this name.
const GITIGNORE = "_gitignore";

/** Writes the project template (only files git tracks in `repo`) into `out`, ready to ship in the npm package. */
export async function buildTemplate(repo: string, out: string): Promise<void> {
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: repo, encoding: "utf8" })
    .split("\0")
    .filter(
      (f) =>
        f &&
        !SKIP_TOP.has(f.split("/")[0] ?? "") &&
        !SKIP_PATHS.some((p) => f.startsWith(p)) &&
        !isRepoReadme(f) &&
        existsSync(join(repo, f)),
    );
  for (const file of files) {
    const target = join(out, file.replace(/(^|\/)\.gitignore$/, `$1${GITIGNORE}`));
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(repo, file), target);
  }
  // A new project gets a README about the project; the repo README is about RR stack itself.
  await copyFile(join(repo, "cli", "project-readme.md"), join(out, "README.md"));
}

/**
 * Copies `source` into `dest` and renames it for `name`. Each overlay is a dir of files that replace
 * or join the template, applied in order: cli/ssr (renderer, loader route, Docker files) and
 * cli/astryx/files (Astryx pages, provider, styles, dependencies). `agentNotes` are appended to AGENTS.md.
 */
export async function scaffold(opts: { name: string; dest: string; source: string; overlays?: string[]; agentNotes?: string[] }): Promise<void> {
  const { name, dest, source, overlays = [], agentNotes = [] } = opts;
  const existing = await readdir(dest).catch(() => []);
  if (existing.length > 0) throw new Error(`${dest} is not empty`);

  for (const dir of [source, ...overlays]) {
    for (const file of await readdir(dir, { recursive: true, withFileTypes: true })) {
      if (!file.isFile()) continue;
      const from = join(file.parentPath, file.name);
      const to = join(dest, from.slice(dir.length + 1));
      await mkdir(dirname(to), { recursive: true });
      await copyFile(from, to);
      if (file.name === GITIGNORE) await rename(to, join(dirname(to), ".gitignore"));
    }
  }

  const crate = `name = "${name}-server"`;
  await edit(join(dest, "server/Cargo.toml"), (s) => must(s, ['name = "rr-server"']).replace('name = "rr-server"', crate));
  await edit(join(dest, "server/Cargo.lock"), (s) => must(s, ['name = "rr-server"']).replace('name = "rr-server"', crate));
  await edit(join(dest, "README.md"), (s) => must(s, ["# RR stack\n"]).replace("# RR stack\n", `# ${name}\n`));
  await edit(join(dest, "package.json"), (s) => {
    const pkg = JSON.parse(s);
    pkg.name = name;
    return `${JSON.stringify(pkg, null, 2)}\n`;
  });
  await edit(join(dest, "web/package.json"), (s) => {
    const pkg = JSON.parse(s);
    pkg.name = `${name}-web`;
    return `${JSON.stringify(pkg, null, 2)}\n`;
  });

  const db = name.replaceAll("-", "_");
  const port = dbPort(name);
  const app = appPort(name);
  const composeSwaps: [string, string][] = [
    ["POSTGRES_USER: rr", `POSTGRES_USER: ${db}`],
    ["POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-rr}", `POSTGRES_PASSWORD: \${POSTGRES_PASSWORD:-${db}}`],
    ["POSTGRES_DB: rr", `POSTGRES_DB: ${db}`],
    ["pg_isready -U rr", `pg_isready -U ${db}`],
    ["127.0.0.1:5432:5432", `127.0.0.1:${port}:5432`],
    ["postgres://rr:${POSTGRES_PASSWORD:-rr}@db:5432/rr", `postgres://${db}:\${POSTGRES_PASSWORD:-${db}}@db:5432/${db}`],
    ["127.0.0.1:8000:3000", `127.0.0.1:${app}:3000`],
    ["http://localhost:8000", `http://localhost:${app}`],
  ];
  await edit(join(dest, "compose.yml"), (s) =>
    composeSwaps.reduce((text, [from, to]) => text.replaceAll(from, to), must(s, composeSwaps.map(([from]) => from))),
  );
  const dbUrl = "postgres://rr:rr@localhost:5432/rr";
  await edit(join(dest, ".env.example"), (s) =>
    must(s, [dbUrl]).replace(dbUrl, `postgres://${db}:${db}@localhost:${port}/${db}`),
  );
  await writeFile(join(dest, ".env"), await readFile(join(dest, ".env.example"), "utf8"));
  for (const notes of agentNotes) {
    const extra = await readFile(notes, "utf8");
    await edit(join(dest, "AGENTS.md"), (s) => s.replace(/\n*$/, "\n") + extra);
  }
}

async function edit(path: string, change: (text: string) => string): Promise<void> {
  await writeFile(path, change(await readFile(path, "utf8")));
}

// Fails loudly if the template changed under the CLI instead of producing a half-renamed project.
function must(text: string, needles: string[]): string {
  const missing = needles.filter((n) => !text.includes(n));
  if (missing.length > 0) throw new Error(`template changed, cannot find: ${missing.join(", ")}`);
  return text;
}
