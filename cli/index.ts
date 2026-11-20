#!/usr/bin/env bun
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildTemplate, scaffold, validateName } from "./scaffold";

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
  // The npm package ships template/ (built by prepack); a git checkout builds it on the fly.
  let source = join(import.meta.dir, "template");
  if (!existsSync(source)) {
    source = join(mkdtempSync(join(tmpdir(), "rr-template-")), "t");
    await buildTemplate(resolve(import.meta.dir, ".."), source);
  }
  await scaffold({ name, dest, source });
} catch (err) {
  console.error(`create-rr-stack: ${(err as Error).message}`);
  process.exit(1);
}

const run = (cmd: string[], cwd: string) => {
  const { exitCode } = Bun.spawnSync(cmd, { cwd, stdout: "inherit", stderr: "inherit" });
  if (exitCode !== 0) {
    console.error(`create-rr-stack: \`${cmd.join(" ")}\` failed in ${cwd}. The project is created; rerun that command there.`);
    process.exit(1);
  }
};
if (!flags.has("--no-install")) run(["bun", "install"], resolve(dest, "web"));
if (!flags.has("--no-git")) run(["git", "init", "-q", "-b", "main"], dest);

console.log(`
Created ${name}. Next:
  cd ${name}
  docker compose up -d --wait
  (cd server && sqlx migrate run)
  scripts/check.sh
  (cd server && cargo run) & (cd web && bun run dev)
Then read AGENTS.md before you (or your agent) write code.`);
