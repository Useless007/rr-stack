// Renders pages (`ssr: true`). The Rust server stays in front: it answers /api and the files in
// build/client itself and forwards every other request here (its WEB_SSR_URL).
import { join } from "node:path";
import { createRequestHandler } from "react-router";

const build = await import(join(import.meta.dir, "build", "server", "index.js"));
const handle = createRequestHandler(build, "production");

const server = Bun.serve({
  hostname: process.env.WEB_HOST ?? "127.0.0.1",
  port: Number(process.env.WEB_PORT ?? "3001"),
  fetch: (request) => handle(request),
});
console.log(`rendering pages at ${server.url}`);
