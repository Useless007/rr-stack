// Regenerates openapi.json from the Rust handlers, then the TypeScript client from openapi.json.
import { $ } from "bun";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { bun, root, run, serverDir, webDir } from "./lib";

export async function generate(specPath: string, clientDir: string): Promise<void> {
  writeFileSync(specPath, await run($`cargo run -q --bin openapi`.cwd(serverDir), true));
  await run($`${bun} x openapi-ts`.cwd(webDir).env({ ...process.env, RR_OPENAPI: specPath, RR_API_OUT: clientDir }), true);
}

if (import.meta.main) {
  await generate(join(root, "openapi.json"), join(webDir, "app/api"));
  console.log("generated openapi.json and web/app/api/");
}
