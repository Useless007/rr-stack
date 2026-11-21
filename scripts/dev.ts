// One command for local development: Postgres in Docker, the Rust API, and the Vite dev server.
import { $ } from "bun";
import { styleText } from "node:util";
import { bun, fail, loadEnv, serverDir, webDir } from "./lib";

loadEnv();
try {
  await $`docker compose up -d --wait db`.quiet();
} catch {
  fail("could not start Postgres with Docker. Is Docker running? (docker compose up -d --wait db)");
}

const apiPort = process.env.PORT ?? "3000";
console.log(`
  ${styleText(["bold", "cyan"], "RR stack")} dev

  - App   ${styleText("cyan", "http://localhost:5173")}
  - API   ${styleText("cyan", `http://localhost:${apiPort}/api/health`)}

  The first run compiles the Rust server, which takes a minute.
`);

const children = [
  Bun.spawn(["cargo", "run", "-q", "--bin", "server"], { cwd: serverDir, stdio: ["inherit", "inherit", "inherit"] }),
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
