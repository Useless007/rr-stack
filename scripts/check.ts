// The definition of done. Exit 0 means SQL, Rust, the OpenAPI contract and the React code agree.
import { $ } from "bun";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generate } from "./gen";
import { bun, fail, loadEnv, root, run, serverDir, step, treeDiff, webDir } from "./lib";

loadEnv();
process.env.SQLX_OFFLINE = "true";

step("rustfmt");
await run($`cargo fmt --check`.cwd(serverDir));
step("clippy (offline SQL metadata from .sqlx/)");
await run($`cargo clippy -q --all-targets -- -D warnings`.cwd(serverDir));

step("contract: openapi.json and web/app/api match a fresh generation");
const tmp = mkdtempSync(join(tmpdir(), "rr-check-"));
try {
  await generate(join(tmp, "openapi.json"), join(tmp, "api"));
  const stale = treeDiff(join(webDir, "app/api"), join(tmp, "api")).map((f) => `web/app/api/${f}`);
  if (readFileSync(join(root, "openapi.json"), "utf8") !== readFileSync(join(tmp, "openapi.json"), "utf8")) stale.unshift("openapi.json");
  if (stale.length > 0) fail(`generated files are stale or hand-edited: ${stale.join(", ")}\nrun 'bun run gen' and commit`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

step("typecheck");
await run($`${bun} run typecheck`.cwd(webDir), true);
step("web build (prerendered pages render)");
await run($`${bun} run build`.cwd(webDir), true);

if (process.env.DATABASE_URL) {
  step("migrations + .sqlx/ up to date");
  await run($`sqlx migrate run`.cwd(serverDir), true);
  await run($`cargo sqlx prepare --check -- --all-targets`.cwd(serverDir));
  step("tests");
  await run($`cargo test -q`.cwd(serverDir));
} else if (process.env.SKIP_DB === "1") {
  console.log("SKIP_DB=1: skipped .sqlx check and tests. This is NOT done.");
} else {
  fail("DATABASE_URL is not set: start the database (docker compose up -d --wait) or set SKIP_DB=1 for a partial check");
}

if (existsSync(join(root, "cli"))) {
  step("cli tests");
  await run($`${bun} test`.cwd(join(root, "cli")));
}

console.log("\ncheck OK");
