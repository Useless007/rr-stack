// Builds the web app, runs the real server binary, and checks what a browser and an API client get.
import { $ } from "bun";
import { createServer } from "node:net";
import { join } from "node:path";
import { bun, exe, fail, loadEnv, onExit, run, serverDir, webDir } from "./lib";

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
onExit(() => server.kill());
const base = `http://127.0.0.1:${port}`;

try {
  let up = false;
  for (let i = 0; i < 100 && !up; i++) {
    up = await fetch(`${base}/api/health`).then((r) => r.ok, () => false);
    if (!up) await Bun.sleep(100);
  }
  if (!up) {
    server.kill();
    fail(`server did not start:\n${await new Response(server.stderr).text()}`);
  }

  const expect = async (path: string, status: number, init?: RequestInit) => {
    const res = await fetch(base + path, init);
    if (res.status !== status) fail(`smoke FAIL: ${init?.method ?? "GET"} ${path} returned ${res.status}, want ${status}`);
    return { type: res.headers.get("content-type") ?? "", body: await res.text() };
  };

  if (!(await expect("/", 200)).body.includes("typed from the database to the screen")) fail("smoke FAIL: / is not the prerendered landing page");
  if (!(await expect("/api-reference/", 200)).body.includes("/api/todos/{id}")) fail("smoke FAIL: /api-reference was not prerendered from openapi.json");
  if (!(await expect("/app/todos", 200)).body.includes("<script")) fail("smoke FAIL: /app/todos did not return the SPA shell");
  if (!(await expect("/api/nope", 404)).type.startsWith("application/json")) fail("smoke FAIL: /api/nope is not JSON");
  const json = { "content-type": "application/json" };
  const todo = JSON.parse((await expect("/api/todos", 201, { method: "POST", headers: json, body: '{"title":"smoke"}' })).body);
  await expect(`/api/todos/${todo.id}`, 200, { method: "PATCH", headers: json, body: '{"done":true}' });
  await expect(`/api/todos/${todo.id}`, 204, { method: "DELETE" });
  console.log("smoke OK");
} finally {
  server.kill();
}
