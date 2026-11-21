// One command for local development: Postgres in Docker, the Rust API, and the Vite dev server.
import { $ } from "bun";
import { styleText } from "node:util";
import { bun, fail, hasSqlx, loadEnv, needBun, run, serverDir, webDir } from "./lib";

needBun();
loadEnv();
try {
  await $`docker compose up -d --wait db`.quiet();
} catch {
  fail("could not start Postgres with Docker. Is Docker running? (docker compose up -d --wait db)");
}

// query! checks SQL against the live database at compile time, so the schema must be current
// before cargo builds; the server's own migrate step only runs after it compiles.
if (await hasSqlx()) {
  await run($`cargo sqlx migrate run`.cwd(serverDir), true);
} else {
  process.env.SQLX_OFFLINE = "true";
  console.log(
    "sqlx-cli not found: building from server/.sqlx. Install it to check new SQL against the database:\n" +
      "  cargo install sqlx-cli --no-default-features --features postgres,rustls",
  );
}

const apiPort = process.env.PORT ?? "3000";
console.log(`
  ${styleText(["bold", "cyan"], "RR stack")} dev

  - App   ${styleText("cyan", "http://localhost:5173")}
  - API   ${styleText("cyan", `http://localhost:${apiPort}/api/health`)}

  The first run compiles the Rust server, which takes a minute.
`);

const children = [
  // WEB_DIST="" : Vite serves the pages in development, the Rust server only the API.
  Bun.spawn(["cargo", "run", "-q", "--bin", "server"], { cwd: serverDir, env: { ...process.env, WEB_DIST: "" }, stdio: ["inherit", "inherit", "inherit"] }),
  Bun.spawn([bun, "run", "dev"], { cwd: webDir, stdio: ["inherit", "inherit", "inherit"] }),
];
const stop = () => {
  for (const c of children) c.kill();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
const code = await Promise.race(children.map((c) => c.exited));
for (const c of children) c.kill();
process.exit(code);
