// Regenerates files/web/package.json and files/web/bun.lock for --astryx apps from the template's own, so the
// overlay never drifts from the template. Run after changing web dependencies: bun cli/astryx/sync.ts
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Astryx is in beta; versions are exact so every new app gets the set CI tested. */
export const ASTRYX = {
  dependencies: { "@astryxdesign/core": "0.7.17", "@astryxdesign/theme-neutral": "0.7.17", "@stylexjs/stylex": "0.19.2" },
  devDependencies: { "@astryxdesign/cli": "0.7.17" },
  // From the Astryx README: a script avoids `astryx` resolving to an unrelated npm package.
  scripts: { astryx: "bun --bun node_modules/@astryxdesign/cli/clients/cli/bin/astryx.mjs" },
};

/** The template's web/package.json with Astryx added; keys stay sorted like `bun add` writes them. */
export function withAstryx(templatePackageJson: string): string {
  const pkg = JSON.parse(templatePackageJson);
  for (const key of ["dependencies", "devDependencies", "scripts"] as const) {
    const merged = { ...pkg[key], ...ASTRYX[key] };
    pkg[key] = key === "scripts" ? merged : Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)));
  }
  return `${JSON.stringify(pkg, null, 2)}\n`;
}

if (import.meta.main) {
  const repo = join(import.meta.dir, "..", "..");
  const out = join(import.meta.dir, "files", "web");
  const work = mkdtempSync(join(tmpdir(), "rr-astryx-"));
  writeFileSync(join(work, "package.json"), withAstryx(readFileSync(join(repo, "web", "package.json"), "utf8")));
  cpSync(join(repo, "web", "bun.lock"), join(work, "bun.lock"));
  const res = Bun.spawnSync([process.execPath, "install", "--lockfile-only"], { cwd: work, stdout: "inherit", stderr: "inherit" });
  if (res.exitCode !== 0) process.exit(res.exitCode ?? 1);
  cpSync(join(work, "package.json"), join(out, "package.json"));
  cpSync(join(work, "bun.lock"), join(out, "bun.lock"));
  console.log("wrote cli/astryx/files/web/package.json and bun.lock");
}
