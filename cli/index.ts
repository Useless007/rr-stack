#!/usr/bin/env bun
import * as p from "@clack/prompts";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { styleText } from "node:util";
import { buildTemplate, scaffold, validateName } from "./scaffold";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const interactive = Boolean(process.stdin.isTTY) && !flags.has("--yes");
const bold = (s: string) => styleText("bold", s);
const cyan = (s: string) => styleText("cyan", s);
const dim = (s: string) => styleText("dim", s);

function bail(message: string): never {
  p.cancel(message);
  process.exit(1);
}

async function ask<T>(prompt: Promise<T | symbol>): Promise<T> {
  const answer = await prompt;
  if (p.isCancel(answer)) bail("Cancelled. Nothing was created.");
  return answer;
}

p.intro(styleText(["bgCyan", "black"], " create-rr-stack "));

let name = args.find((a) => !a.startsWith("--")) ?? "";
if (!name) {
  if (!interactive) bail("Give the project a name: bun create rr-stack my-app");
  name = await ask(
    p.text({ message: "What is your project named?", placeholder: "my-app", defaultValue: "my-app", validate: (v) => validateName(v || "my-app") ?? undefined }),
  );
}
const problem = validateName(name);
if (problem) bail(`"${name}" is not a valid name: ${problem}`);

const install = flags.has("--no-install") ? false : interactive ? await ask(p.confirm({ message: "Install the web dependencies now?" })) : true;
const git = flags.has("--no-git") ? false : interactive ? await ask(p.confirm({ message: "Initialize a git repository?" })) : true;

const dest = resolve(process.cwd(), name);
const spin = p.spinner();
spin.start("Copying the template");
try {
  // The npm package ships template/ (built by prepack); a git checkout builds it on the fly.
  let source = join(import.meta.dir, "template");
  if (!existsSync(source)) {
    source = join(mkdtempSync(join(tmpdir(), "rr-template-")), "t");
    await buildTemplate(resolve(import.meta.dir, ".."), source);
  }
  await scaffold({ name, dest, source });
} catch (err) {
  spin.error("Could not create the project");
  bail((err as Error).message);
}
spin.stop(`Created ${bold(name)}`);

const run = async (label: string, cmd: string[], cwd: string) => {
  spin.start(label);
  const proc = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  if ((await proc.exited) !== 0) {
    spin.error(`${label} failed`);
    p.log.message(dim(await new Response(proc.stderr).text()));
    p.log.warn(`The project is created. Run \`${cmd.join(" ")}\` in ${cwd} yourself.`);
    return;
  }
  spin.stop(label.replace(/^Installing/, "Installed").replace(/^Initializing/, "Initialized"));
};
if (install) await run("Installing the web dependencies", [process.execPath, "install"], join(dest, "web"));
if (git) await run("Initializing a git repository", ["git", "init", "-q", "-b", "main"], dest);

const where = relative(process.cwd(), dest) || ".";
p.note(
  [
    `${cyan("cd")} ${where}`,
    `${cyan("bun run dev")}      ${dim("Postgres, the Rust API and the app, together")}`,
    "",
    `${cyan("bun run check")}    ${dim("is it done? exit 0 means every layer agrees")}`,
    `${cyan("bun run gen")}      ${dim("regenerate the contract and client after an API change")}`,
  ].join("\n"),
  "Next steps",
);
p.outro(`${styleText("green", "Success!")} Created ${bold(name)} at ${dest}\n   ${dim("Working with an AI agent? Point it at AGENTS.md first.")}`);
