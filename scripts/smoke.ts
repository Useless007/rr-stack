// Builds the web app, runs the real server binary, and checks what a browser and an API client get.
import { $ } from "bun";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { bun, exe, fail, loadEnv, needBun, onExit, run, serverDir, webDir } from "./lib";

needBun();
loadEnv();
if (!process.env.DATABASE_URL) fail("DATABASE_URL is not set (copy .env.example to .env)");

await run($`${bun} run build`.cwd(webDir), true);
await run($`cargo build -q --bin server`.cwd(serverDir), true);

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = createServer().listen(0, "127.0.0.1", () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });
const port = await freePort();
const base = `http://127.0.0.1:${port}`;

// Apps created with --ssr render pages in web/server.ts; the Rust server forwards to it.
const ssr = existsSync(join(webDir, "server.ts"));
const env: Record<string, string | undefined> = { ...process.env, PORT: String(port), WEB_DIST: join(webDir, "build", "client") };
let renderer: ReturnType<typeof Bun.spawn> | undefined;
if (ssr) {
  const webPort = await freePort();
  renderer = Bun.spawn([bun, "server.ts"], {
    cwd: webDir,
    env: { ...process.env, WEB_PORT: String(webPort), API_URL: base },
    stdout: "ignore",
    stderr: "inherit",
  });
  onExit(() => renderer?.kill());
  env.WEB_SSR_URL = `http://127.0.0.1:${webPort}`;
}
const server = Bun.spawn([join(serverDir, "target", "debug", `server${exe}`)], { env, stdout: "ignore", stderr: "pipe" });
onExit(() => server.kill());

try {
  let up = false;
  for (let i = 0; i < 100 && !up; i++) {
    up = await fetch(`${base}/api/health`).then((r) => r.ok, () => false);
    if (!up) await Bun.sleep(100);
  }
  // The renderer imports the whole server build, which can take longer than Rust's start.
  for (let i = 0; i < 100 && up && env.WEB_SSR_URL; i++) {
    if (await fetch(env.WEB_SSR_URL).then(() => true, () => false)) break;
    await Bun.sleep(100);
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
  if (!(await expect("/app/todos", 200)).body.includes("<script")) fail(`smoke FAIL: /app/todos did not return ${ssr ? "a rendered page" : "the SPA shell"}`);
  if (!(await expect("/api/nope", 404)).type.startsWith("application/json")) fail("smoke FAIL: /api/nope is not JSON");
  // SEO: public pages carry canonical and share tags, and crawlers find them through the sitemap.
  const home = (await expect("/how-it-works/", 200)).body;
  if (!/<link rel="canonical" href="https?:\/\/[^"]+\/how-it-works"/.test(home) || !home.includes('property="og:image"')) fail("smoke FAIL: /how-it-works has no canonical link or og:image");
  if (!(await expect("/sitemap.xml", 200)).body.includes("/how-it-works</loc>")) fail("smoke FAIL: /sitemap.xml does not list /how-it-works");
  if (!(await expect("/robots.txt", 200)).body.includes("Sitemap: ")) fail("smoke FAIL: /robots.txt does not point at the sitemap");
  if (!(await expect("/og.png", 200)).type.startsWith("image/png")) fail("smoke FAIL: /og.png is not served");
  if (ssr) {
    if (!(await expect("/app", 200)).body.includes('<meta name="robots" content="noindex"')) fail("smoke FAIL: /app can be indexed");
    if (!(await expect("/no-such-page", 404)).body.includes('<meta name="robots" content="noindex"')) fail("smoke FAIL: /no-such-page can be indexed");
  }
  // Realtime: a change made over HTTP must reach a WebSocket client.
  const ws = new WebSocket(`ws://127.0.0.1:${port}/api/events`);
  await new Promise((ok, no) => ((ws.onopen = ok), (ws.onerror = no)));
  const received = new Promise<string>((ok) => (ws.onmessage = (m) => ok(String(m.data))));

  // Auth: sign up gets an HttpOnly session cookie; writes without it are refused.
  const plain = { "content-type": "application/json" };
  await expect("/api/todos", 401, { method: "POST", headers: plain, body: '{"title":"smoke"}' });
  const email = `smoke-${crypto.randomUUID()}@example.com`;
  const signUp = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: plain,
    body: JSON.stringify({ email, password: "smoke-test-password" }),
  });
  const setCookie = signUp.headers.get("set-cookie") ?? "";
  if (signUp.status !== 201 || !setCookie.includes("HttpOnly")) fail(`smoke FAIL: register returned ${signUp.status}, cookie "${setCookie}"`);
  const json = { ...plain, cookie: setCookie.split(";")[0]! };
  await expect("/api/auth/me", 200, { headers: json });

  const todo = JSON.parse((await expect("/api/todos", 201, { method: "POST", headers: json, body: '{"title":"smoke"}' })).body);
  const event = JSON.parse(await Promise.race([received, Bun.sleep(5000).then(() => "{}")]));
  if (event.type !== "created" || event.todo?.id !== todo.id) fail("smoke FAIL: WebSocket /api/events did not deliver the created event");
  ws.close();
  if (ssr) {
    // The loader ran on the server: the todo is in the first HTML, title included.
    const page = (await expect(`/app/todos/${todo.id}`, 200, { headers: { cookie: json.cookie } })).body;
    if (!page.includes("<title>smoke · RR stack</title>") || !page.includes('value="smoke"')) fail(`smoke FAIL: /app/todos/${todo.id} was not rendered with its data`);
    await expect("/app/todos/999999999", 404);
  }
  await expect(`/api/todos/${todo.id}`, 200, { method: "PATCH", headers: json, body: '{"done":true}' });
  await expect(`/api/todos/${todo.id}`, 204, { method: "DELETE", headers: json });
  await expect("/api/auth/logout", 204, { method: "POST", headers: json });
  console.log(`smoke OK${ssr ? " (ssr)" : ""}`);
} finally {
  server.kill();
  renderer?.kill();
}
