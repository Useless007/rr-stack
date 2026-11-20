#!/usr/bin/env bun
// shortcut: copies the template from this checkout (the CLI's parent dir); publishing to npm needs the template bundled into the package.
import { resolve } from "node:path";
import { scaffold, validateName } from "./scaffold";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const name = args.find((a) => !a.startsWith("--")) ?? prompt("Project name:")?.trim() ?? "";

const problem = validateName(name);
if (problem) {
  console.error(`create-rr-stack: invalid name "${name}": ${problem}`);
  process.exit(1);
}

const dest = resolve(process.cwd(), name);
try {
  await scaffold({ name, dest, source: resolve(import.meta.dir, "..") });
} catch (err) {
  console.error(`create-rr-stack: ${(err as Error).message}`);
  process.exit(1);
}

const run = (cmd: string[], cwd: string) => {
  const { exitCode } = Bun.spawnSync(cmd, { cwd, stdout: "inherit", stderr: "inherit" });
  if (exitCode !== 0) throw new Error(`${cmd.join(" ")} failed in ${cwd}`);
};
if (!flags.has("--no-install")) run(["bun", "install"], resolve(dest, "web"));
if (!flags.has("--no-git")) run(["git", "init", "-q", "-b", "main"], dest);

console.log(`
Created ${name}. Next:
  cd ${name}
  docker compose up -d --wait
  (cd server && sqlx migrate run)
  scripts/check.sh
Then read AGENTS.md before you (or your agent) write code.`);
