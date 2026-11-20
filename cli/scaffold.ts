import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
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

// Tracked in the template repo but not part of a new project.
const SKIP_TOP = new Set(["cli", "docs"]);

export async function scaffold(opts: { name: string; dest: string; source: string }): Promise<void> {
  const { name, dest, source } = opts;
  const existing = await readdir(dest).catch(() => []);
  if (existing.length > 0) throw new Error(`${dest} is not empty`);

  // Only what git tracks: untracked caches, local env files and build output can never leak.
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: source, encoding: "utf8" })
    .split("\0")
    .filter((f) => f && !SKIP_TOP.has(f.split("/")[0] ?? "") && existsSync(join(source, f)));
  for (const file of files) {
    await mkdir(dirname(join(dest, file)), { recursive: true });
    await copyFile(join(source, file), join(dest, file));
  }

  await edit(join(dest, "server/Cargo.toml"), (s) => s.replace(/^name = ".*"$/m, `name = "${name}-server"`));
  await edit(join(dest, "web/package.json"), (s) => {
    const pkg = JSON.parse(s);
    pkg.name = `${name}-web`;
    return `${JSON.stringify(pkg, null, 2)}\n`;
  });

  const db = name.replaceAll("-", "_");
  const port = dbPort(name);
  await edit(join(dest, "compose.yml"), (s) =>
    must(s, ["POSTGRES_USER: rr", "POSTGRES_PASSWORD: rr", "POSTGRES_DB: rr", "pg_isready -U rr", "127.0.0.1:5432:5432"])
      .replace("POSTGRES_USER: rr", `POSTGRES_USER: ${db}`)
      .replace("POSTGRES_PASSWORD: rr", `POSTGRES_PASSWORD: ${db}`)
      .replace("POSTGRES_DB: rr", `POSTGRES_DB: ${db}`)
      .replace("pg_isready -U rr", `pg_isready -U ${db}`)
      .replace("127.0.0.1:5432:5432", `127.0.0.1:${port}:5432`),
  );
  const dbUrl = "postgres://rr:rr@localhost:5432/rr";
  await edit(join(dest, ".env.example"), (s) =>
    must(s, [dbUrl]).replace(dbUrl, `postgres://${db}:${db}@localhost:${port}/${db}`),
  );
  await writeFile(join(dest, ".env"), await readFile(join(dest, ".env.example"), "utf8"));
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
