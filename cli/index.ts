#!/usr/bin/env bun
import * as p from "@clack/prompts";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { styleText } from "node:util";
import pkg from "./package.json";
import { appPort, buildTemplate, isOlder, latestVersion, scaffold, validateName } from "./scaffold";

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

p.intro(styleText(["bgCyan", "black"], ` create-rr-stack ${pkg.version} `));

if (isOlder(Bun.version, "1.4.0")) {
  p.log.warn(`bun ${Bun.version} is too old for the web build (needs 1.4.0 or newer). Run ${cyan("bun upgrade")} first.`);
}

// bun and npx cache the package, so a plain `bun create rr-stack` can run an old copy.
const newest = await latestVersion();
if (newest && isOlder(pkg.version, newest)) {
  p.log.warn(`create-rr-stack ${newest} is out; this is ${pkg.version}, an older copy from the cache.\n` +
    `To start from the newest template, press Ctrl+C and run: ${cyan(`bun create rr-stack@latest ${args.join(" ") || "my-app"}`)}`);
}

let name = args.find((a) => !a.startsWith("--")) ?? "";
if (!name) {
  if (!interactive) bail("Give the project a name: bun create rr-stack my-app");
  name = await ask(
    p.text({ message: "What is your project named?", placeholder: "my-app", defaultValue: "my-app", validate: (v) => validateName(v || "my-app") ?? undefined }),
  );
}
const problem = validateName(name);
if (problem) bail(`"${name}" is not a valid name: ${problem}`);

const modes = [
  { value: false, label: "Prerender + SPA", hint: "one Rust binary, no Node at runtime" },
  { value: true, label: "Server rendering (SSR)", hint: "every page as HTML per request; adds a bun process" },
];
const renderQuestion = "How should pages render?";
let ssr: boolean;
if (flags.has("--ssr") || flags.has("--spa")) {
  ssr = flags.has("--ssr");
  // Shown like an answered prompt, so the choice is on screen even when it came from a flag.
  p.log.step(`${renderQuestion}\n${dim(modes.find((m) => m.value === ssr)!.label)}`);
} else {
  ssr = interactive ? await ask(p.select({ message: renderQuestion, options: modes })) : false;
}
const install = flags.has("--no-install") ? false : interactive ? await ask(p.confirm({ message: "Install the web dependencies now?" })) : true;
const git = flags.has("--no-git") ? false : interactive ? await ask(p.confirm({ message: "Initialize a git repository?" })) : true;

const dest = resolve(process.cwd(), name);
// Only a folder this run creates may be cleaned up; an existing one is never touched.
if (existsSync(dest) && readdirSync(dest).length > 0) bail(`${dest} already exists and is not empty. Pick another name.`);
const ownsDest = !existsSync(dest);
let created = false;
// Ctrl+C while a spinner runs: stop, and remove a half-copied project.
const spin = p.spinner({
  onCancel: () => {
    if (!created && ownsDest) rmSync(dest, { recursive: true, force: true });
    process.exit(130);
  },
});
spin.start("Copying the template");
try {
  // The npm package ships template/ (built by prepack); a git checkout builds it on the fly.
  let source = join(import.meta.dir, "template");
  if (!existsSync(source)) {
    source = join(mkdtempSync(join(tmpdir(), "rr-template-")), "t");
    await buildTemplate(resolve(import.meta.dir, ".."), source);
  }
  await scaffold({ name, dest, source, ssr: ssr ? join(import.meta.dir, "ssr") : undefined });
} catch (err) {
  if (ownsDest) rmSync(dest, { recursive: true, force: true });
  spin.error("Could not create the project");
  bail((err as Error).message);
}
created = true;
spin.stop(`Created ${bold(name)}`);

const run = async (label: string, cmd: string[], cwd: string) => {
  spin.start(label);
  let output = "";
  let ok = false;
  try {
    const proc = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
    ok = (await proc.exited) === 0;
    output = await new Response(proc.stderr).text();
  } catch (err) {
    output = `${cmd[0]} could not be started: ${(err as Error).message}`;
  }
  if (!ok) {
    spin.error(`${label} failed`);
    p.log.message(dim(output));
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
    `${dim(ssr ? "Server rendering: pages render in web/server.ts, data in route loaders" : "Prerender + SPA: one Rust binary serves the API and the pages")}`,
    "",
    `${cyan("cd")} ${where}`,
    `${cyan("bun run dev")}      ${dim("Postgres, the Rust API and the app, together")}`,
    "",
    `${cyan("bun run check")}    ${dim("is it done? exit 0 means every layer agrees")}`,
    `${cyan("bun run gen")}      ${dim("regenerate the contract and client after an API change")}`,
    "",
    `${dim("No Rust or bun on this machine? Docker runs the whole app:")}`,
    `${cyan("docker compose up -d")}  ${dim(`then open http://localhost:${appPort(name)}`)}`,
  ].join("\n"),
  "Next steps",
);
p.outro(`${styleText("green", "Success!")} Created ${bold(name)} at ${dest}\n   ${dim("Working with an AI agent? Point it at AGENTS.md first.")}`);
