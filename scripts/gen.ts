// Regenerates openapi.json from the Rust handlers, then the TypeScript client from openapi.json.
import { $ } from "bun";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { bun, hasSqlx, loadEnv, root, run, serverDir, step, webDir } from "./lib";

export async function generate(specPath: string, clientDir: string): Promise<void> {
  writeFileSync(specPath, await run($`cargo run -q --bin openapi`.cwd(serverDir), true));
  await run($`${bun} x openapi-ts`.cwd(webDir).env({ ...process.env, RR_OPENAPI: specPath, RR_API_OUT: clientDir }), true);
}

if (import.meta.main) {
  loadEnv();
  // With DATABASE_URL set, the query! macros check their SQL against that database while the openapi
  // binary compiles, so a database without the tables (a new one, a fresh container) fails with
  // dozens of "relation does not exist" errors. Bring it up to date first, as `bun run check` does.
  if (process.env.DATABASE_URL && !process.env.SQLX_OFFLINE && (await hasSqlx())) {
    step("migrations");
    await run($`cargo sqlx migrate run`.cwd(serverDir), true);
  }
  await generate(join(root, "openapi.json"), join(webDir, "app/api"));
  console.log("generated openapi.json and web/app/api/");
}
