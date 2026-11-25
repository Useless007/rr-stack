// The definition of done. Exit 0 means SQL, Rust, the OpenAPI contract and the React code agree.
import { $ } from "bun";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generate } from "./gen";
import { bun, fail, hasSqlx, loadEnv, need, needBun, onExit, root, run, serverDir, step, treeDiff, webDir } from "./lib";

needBun();
loadEnv();
process.env.SQLX_OFFLINE = "true";
need("cargo", "https://rustup.rs");
const skipDb = process.env.SKIP_DB === "1";
if (!skipDb && !(await hasSqlx())) fail("sqlx-cli is not installed. Install it with: cargo install sqlx-cli --no-default-features --features postgres,rustls");

step("bun version: package.json's packageManager and every Dockerfile's oven/bun image agree");
{
  // CI reads packageManager (setup-bun's bun-version-file); the Docker images name their own tag.
  // Bump all of them together, or CI and the deployed image build with different bun versions.
  const pinned = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).packageManager?.match(/^bun@(.+)$/)?.[1];
  if (!pinned) fail('package.json needs "packageManager": "bun@<version>"');
  const dockerfiles = [join(root, "Dockerfile"), join(root, "cli/ssr/Dockerfile")].filter((f) => existsSync(f));
  const off = dockerfiles.flatMap((file) =>
    [...readFileSync(file, "utf8").matchAll(/^FROM oven\/bun:([^\s-]+)/gm)]
      .filter((m) => m[1] !== pinned)
      .map((m) => `${file.slice(root.length + 1)}: oven/bun:${m[1]}`),
  );
  if (off.length) fail(`package.json pins bun ${pinned}, but:\n  ${off.join("\n  ")}`);
}

step("rustfmt");
await run($`cargo fmt --check`.cwd(serverDir));
step("clippy (offline SQL metadata from .sqlx/)");
await run($`cargo clippy -q --all-targets -- -D warnings`.cwd(serverDir));

step("contract: openapi.json and web/app/api match a fresh generation");
const tmp = mkdtempSync(join(tmpdir(), "rr-check-"));
onExit(() => rmSync(tmp, { recursive: true, force: true }));
try {
  await generate(join(tmp, "openapi.json"), join(tmp, "api"));
  const stale = treeDiff(join(webDir, "app/api"), join(tmp, "api")).map((f) => `web/app/api/${f}`);
  if (readFileSync(join(root, "openapi.json"), "utf8") !== readFileSync(join(tmp, "openapi.json"), "utf8")) stale.unshift("openapi.json");
  if (stale.length > 0) fail(`generated files are stale or hand-edited: ${stale.join(", ")}\nrun 'bun run gen' and commit`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

step("web tests");
await run($`${bun} run test`.cwd(webDir));
step("typecheck");
await run($`${bun} run typecheck`.cwd(webDir), true);
step("web build (prerendered pages render)");
await run($`${bun} run build`.cwd(webDir), true);

if (skipDb) {
  console.log("SKIP_DB=1: skipped .sqlx check and tests. This is NOT done.");
} else if (process.env.DATABASE_URL) {
  step("migrations + .sqlx/ up to date");
  await run($`cargo sqlx migrate run`.cwd(serverDir), true);
  await run($`cargo sqlx prepare --check -- --all-targets`.cwd(serverDir));
  step("tests");
  await run($`cargo test -q`.cwd(serverDir));
} else {
  fail("DATABASE_URL is not set: copy .env.example to .env and start the database (docker compose up -d --wait db), or set SKIP_DB=1 for a partial check");
}

if (existsSync(join(root, "cli"))) {
  step("cli tests");
  await run($`${bun} test`.cwd(join(root, "cli")));
}

console.log("\ncheck OK");
