// Builds the web app, runs the real server binary, and checks what a browser and an API client get.
import { $ } from "bun";
import { createServer } from "node:net";
import { join } from "node:path";
import { bun, exe, fail, loadEnv, run, serverDir, webDir } from "./lib";

loadEnv();
if (!process.env.DATABASE_URL) fail("DATABASE_URL is not set (copy .env.example to .env)");

await run($`${bun} run build`.cwd(webDir), true);
await run($`cargo build -q --bin server`.cwd(serverDir), true);

const port = await new Promise<number>((resolve) => {
  const s = createServer().listen(0, "127.0.0.1", () => {
    const { port } = s.address() as { port: number };
    s.close(() => resolve(port));
  });
});
const server = Bun.spawn([join(serverDir, "target", "debug", `server${exe}`)], {
  env: { ...process.env, PORT: String(port), WEB_DIST: join(webDir, "build", "client") },
  stdout: "pipe",
  stderr: "pipe",
});
const base = `http://127.0.0.1:${port}`;

try {
  let up = false;
  for (let i = 0; i < 100 && !up; i++) {
    up = await fetch(`${base}/api/health`).then((r) => r.ok, () => false);
    if (!up) await Bun.sleep(100);
  }
  if (!up) fail(`server did not start:\n${await new Response(server.stderr).text()}`);

  const expect = async (path: string, status: number, init?: RequestInit) => {
    const res = await fetch(base + path, init);
    if (res.status !== status) fail(`smoke FAIL: ${init?.method ?? "GET"} ${path} returned ${res.status}, want ${status}`);
    return { type: res.headers.get("content-type") ?? "", body: await res.text() };
  };

  if (!(await expect("/", 200)).body.includes("Typed from the database to the screen")) fail("smoke FAIL: / is not the prerendered landing page");
  if (!(await expect("/app/todos", 200)).body.includes("<script")) fail("smoke FAIL: /app/todos did not return the SPA shell");
  if (!(await expect("/api/nope", 404)).type.startsWith("application/json")) fail("smoke FAIL: /api/nope is not JSON");
  await expect("/api/todos", 201, { method: "POST", headers: { "content-type": "application/json" }, body: '{"title":"smoke"}' });
  console.log("smoke OK");
} finally {
  server.kill();
}
