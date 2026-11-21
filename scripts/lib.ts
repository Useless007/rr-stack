import { $ } from "bun";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

export const root = join(import.meta.dir, "..");
export const serverDir = join(root, "server");
export const webDir = join(root, "web");
export const bun = process.execPath;

/** Oldest bun that runs React Router's build and dev server (older ones fail to prerender). */
export const MIN_BUN = "1.4.0";
const older = (a: string, b: string) => {
  const [x, y] = [a, b].map((v) => v.split(".").map((n) => Number.parseInt(n, 10)));
  for (let i = 0; i < 3; i++) if ((x![i] ?? 0) !== (y![i] ?? 0)) return (x![i] ?? 0) < (y![i] ?? 0);
  return false;
};
/** Exits with an upgrade hint when this bun is too old for the web build. */
export function needBun(): void {
  if (older(Bun.version, MIN_BUN)) fail(`bun ${Bun.version} is too old; RR stack needs ${MIN_BUN} or newer. Run: bun upgrade`);
}
export const exe = process.platform === "win32" ? ".exe" : "";

/** Loads the project's .env into process.env without overriding real environment variables. */
export function loadEnv(): void {
  const file = join(root, ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!.replace(/^(['"])(.*)\1$/, "$2");
  }
}

export function step(title: string): void {
  console.log(`\n== ${title}`);
}

const cleanups: (() => void)[] = [];
/** Registers work that must happen even when a script fails (kill a server, delete a temp dir). */
export function onExit(fn: () => void): void {
  cleanups.push(fn);
}

export function fail(message: string): never {
  console.error(`\n${message}`);
  for (const fn of cleanups.splice(0)) fn();
  process.exit(1);
}

/** Exits with an install hint when a required tool is missing from PATH. */
export function need(tool: string, install: string): void {
  if (!Bun.which(tool)) fail(`${tool} is not installed. Install it with: ${install}`);
}

/** True when sqlx-cli is installed. Asks cargo, which also finds it in ~/.cargo/bin when that is not on PATH. */
export async function hasSqlx(): Promise<boolean> {
  return (await $`cargo sqlx --version`.quiet().nothrow()).exitCode === 0;
}

/** Runs a shell command; on failure prints its captured output and exits 1. */
export async function run(cmd: ReturnType<typeof $>, quiet = false): Promise<string> {
  try {
    const out = quiet ? await cmd.quiet() : await cmd;
    return out.stdout.toString();
  } catch (err) {
    if (err instanceof $.ShellError) {
      if (quiet) process.stderr.write(err.stdout.toString() + err.stderr.toString());
      fail(`failed with exit code ${err.exitCode} in the step above`);
    }
    throw err;
  }
}

/** Relative paths of files under dir whose content differs between the two trees, or that exist in only one. */
export function treeDiff(a: string, b: string): string[] {
  const list = (dir: string) =>
    existsSync(dir)
      ? readdirSync(dir, { recursive: true, withFileTypes: true })
          .filter((e) => e.isFile())
          .map((e) => relative(dir, join(e.parentPath, e.name)).replaceAll("\\", "/"))
      : [];
  const files = new Set([...list(a), ...list(b)]);
  return [...files].filter((f) => {
    const pa = join(a, f);
    const pb = join(b, f);
    return !existsSync(pa) || !existsSync(pb) || readFileSync(pa, "utf8") !== readFileSync(pb, "utf8");
  });
}
