// Runs the browser tests in web/e2e against the real app: built pages, the Rust server and Postgres.
import { $ } from "bun";
import { startApp } from "./app";
import { bun, fail, loadEnv, needBun, run, webDir } from "./lib";

needBun();
loadEnv();
// Downloads Chromium on the first run, then finds it already there. On a fresh Linux CI machine add
// the system libraries first: bun --bun playwright-core install --with-deps --only-shell chromium
await run($`${bun} --bun playwright-core install --only-shell chromium`.cwd(webDir), true);

const app = await startApp();
// bun's 5 s default would cut a test off before Playwright's own 10 s waits fail and screenshot it.
const tests = Bun.spawn([bun, "test", "--timeout", "60000", "./e2e", ...process.argv.slice(2)], {
  cwd: webDir,
  env: { ...process.env, E2E_BASE_URL: app.base },
  stdio: ["inherit", "inherit", "inherit"],
});
const code = await tests.exited;
app.stop();
if (code !== 0) fail(`e2e FAIL. Screenshots of the failing pages are in web/e2e/results/.`);
console.log(`e2e OK${app.ssr ? " (ssr)" : ""}`);
