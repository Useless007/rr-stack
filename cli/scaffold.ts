import { cp, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";

/** Returns null when the name is usable as a directory, Cargo package and npm package; else why not. */
export function validateName(name: string): string | null {
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(name)) {
    return "use lowercase letters, digits and dashes, starting with a letter (max 64)";
  }
  if (name.endsWith("-")) return "must not end with a dash";
  return null;
}

// Template-repo internals and build output never belong in a new project.
const SKIP_ANYWHERE = new Set([".env", "node_modules", "target", "build", ".react-router", ".git", ".superpowers", ".omc"]);
const SKIP_AT_ROOT = new Set(["cli", "docs"]);

export async function scaffold(opts: { name: string; dest: string; source: string }): Promise<void> {
  const { name, dest, source } = opts;
  const existing = await readdir(dest).catch(() => []);
  if (existing.length > 0) throw new Error(`${dest} is not empty`);

  await cp(source, dest, {
    recursive: true,
    filter: (src) => {
      const rel = relative(source, src);
      if (rel === "") return true;
      if (SKIP_ANYWHERE.has(basename(src))) return false;
      return rel.includes("/") || !SKIP_AT_ROOT.has(rel);
    },
  });

  const cargoToml = join(dest, "server/Cargo.toml");
  const cargo = await readFile(cargoToml, "utf8");
  await writeFile(cargoToml, cargo.replace(/^name = ".*"$/m, `name = "${name}-server"`));

  const webPkgPath = join(dest, "web/package.json");
  const webPkg = JSON.parse(await readFile(webPkgPath, "utf8"));
  webPkg.name = `${name}-web`;
  await writeFile(webPkgPath, `${JSON.stringify(webPkg, null, 2)}\n`);

  await writeFile(join(dest, ".env"), await readFile(join(dest, ".env.example"), "utf8"));
}
