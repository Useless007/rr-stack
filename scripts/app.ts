// Builds the web app and the server, then runs the real server binary on a free port (and the page
// renderer, in apps created with --ssr). Used by smoke.ts and e2e.ts.
import { $ } from "bun";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { bun, fail, onExit, run, serverDir, webDir } from "./lib";

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = createServer().listen(0, "127.0.0.1", () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });

export type App = { base: string; port: number; ssr: boolean; stop: () => void };

/**
 * The server executable cargo just built, from its JSON messages. Cargo knows where it put it: under
 * server/target, or wherever CARGO_TARGET_DIR or a .cargo/config.toml sends builds.
 */
export function serverBinary(cargoJson: string): string {
  for (const line of cargoJson.split("\n")) {
    if (!line.startsWith("{")) continue;
    const message = JSON.parse(line) as { reason?: string; target?: { name?: string }; executable?: string | null };
    if (message.reason === "compiler-artifact" && message.target?.name === "server" && message.executable) return message.executable;
  }
  return fail("cargo build reported no server executable");
}

export async function startApp(): Promise<App> {
  if (!process.env.DATABASE_URL) fail("DATABASE_URL is not set (copy .env.example to .env)");
  await run($`${bun} run build`.cwd(webDir), true);
  const binary = serverBinary(await run($`cargo build -q --bin server --message-format=json`.cwd(serverDir), true));

  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  // Apps created with --ssr render pages in web/server.ts; the Rust server forwards to it.
  const ssr = existsSync(join(webDir, "server.ts"));
  const env: Record<string, string | undefined> = {
    ...process.env,
    PORT: String(port),
    WEB_DIST: join(webDir, "build", "client"),
    // The sign-in limit is counted in the database, so back-to-back test runs would share it.
    SIGN_IN_LIMIT: "1000",
  };
  let renderer: ReturnType<typeof Bun.spawn> | undefined;
  if (ssr) {
    const webPort = await freePort();
    renderer = Bun.spawn([bun, "server.ts"], {
      cwd: webDir,
      env: { ...process.env, WEB_PORT: String(webPort), API_URL: base },
      stdout: "ignore",
      stderr: "inherit",
    });
    env.WEB_SSR_URL = `http://127.0.0.1:${webPort}`;
  }
  const server = Bun.spawn([binary], { env, stdout: "ignore", stderr: "pipe" });
  const stop = () => {
    server.kill();
    renderer?.kill();
  };
  onExit(stop);

  let up = false;
  for (let i = 0; i < 100 && !up; i++) {
    up = await fetch(`${base}/api/health`).then((r) => r.ok, () => false);
    if (!up) await Bun.sleep(100);
  }
  if (!up) {
    server.kill();
    fail(`server did not start:\n${await new Response(server.stderr).text()}`);
  }
  // The renderer imports the whole server build, which can take longer than Rust's start.
  for (let i = 0; i < 100 && env.WEB_SSR_URL; i++) {
    if (await fetch(env.WEB_SSR_URL).then(() => true, () => false)) break;
    await Bun.sleep(100);
  }
  return { base, port, ssr, stop };
}
