// Runs the browser tests in web/e2e against the real app: built pages, the Rust server and Postgres.
// `bun run e2e --url https://preview.example.com` runs them against a deployment instead. The tests
// sign up users and add todos there, so point it at a preview with its own database.
import { $ } from "bun";
import { startApp } from "./app";
import { bun, fail, loadEnv, needBun, run, webDir } from "./lib";

needBun();
loadEnv();
// Downloads Chromium on the first run, then finds it already there. On a fresh Linux CI machine add
// the system libraries first: bun --bun playwright-core install --with-deps --only-shell chromium
await run($`${bun} --bun playwright-core install --only-shell chromium`.cwd(webDir), true);

const args = process.argv.slice(2);
const at = args.indexOf("--url");
const url = at >= 0 ? args.splice(at, 2)[1] : undefined;
if (at >= 0 && !url?.startsWith("http")) fail("--url needs an address, for example --url https://my-app.vercel.app");
const app = url ? { base: url, ssr: false, stop: () => {} } : await startApp();
// bun's 5 s default would cut a test off before Playwright's own 10 s waits fail and screenshot it.
const tests = Bun.spawn([bun, "test", "--timeout", "60000", "./e2e", ...args], {
  cwd: webDir,
  env: { ...process.env, E2E_BASE_URL: app.base },
  stdio: ["inherit", "inherit", "inherit"],
});
const code = await tests.exited;
app.stop();
if (code !== 0) fail(`e2e FAIL. Screenshots of the failing pages are in web/e2e/results/.`);
console.log(`e2e OK${url ? ` (${url})` : app.ssr ? " (ssr)" : ""}`);
