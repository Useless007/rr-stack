// Runs the page renderer and the Rust server together in one container: the image's default
// command, for hosts that run one process per container (Vercel). compose.yml runs them as two
// containers instead (`app` and `web`), each with its own command.
import { join } from "node:path";

const webPort = process.env.WEB_PORT ?? "3001";
const apiPort = process.env.PORT ?? "3000";
const local = (port: string) => `http://127.0.0.1:${port}`;

let server: ReturnType<typeof Bun.spawn> | undefined;
const renderer = Bun.spawn([process.execPath, join(import.meta.dir, "server.ts")], {
  env: { ...process.env, WEB_HOST: "127.0.0.1", WEB_PORT: webPort, API_URL: local(apiPort) },
  stdio: ["inherit", "inherit", "inherit"],
});
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    server?.kill(signal);
    renderer.kill(signal);
  });
}

// The server starts listening only once pages can render, so the host never routes a visitor to a 502.
const ready = async () => {
  for (let i = 0; i < 300; i++) {
    if (await fetch(`${local(webPort)}/robots.txt`).then(() => true, () => false)) return true;
    await Bun.sleep(100);
  }
  return false;
};
const up = await Promise.race([ready(), renderer.exited.then(() => false)]);
if (!up) {
  console.error("the page renderer did not start");
  renderer.kill();
  process.exit(1);
}
server = Bun.spawn([join(import.meta.dir, "..", "server")], {
  env: { ...process.env, WEB_SSR_URL: local(webPort) },
  stdio: ["inherit", "inherit", "inherit"],
});

// If either process stops, stop the other too and exit, so the host restarts the container.
const code = await Promise.race([server.exited, renderer.exited]);
server.kill();
renderer.kill();
process.exit(code);
