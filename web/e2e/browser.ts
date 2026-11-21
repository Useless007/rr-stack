// A real Chromium for the tests in this folder (run them with `bun run e2e` at the project root).
// Every page fails its test on a JavaScript error, a React hydration error, or a 5xx response, and a
// failing test leaves a screenshot in e2e/results/ to look at.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright-core";

const base = process.env.E2E_BASE_URL;
if (!base) throw new Error("E2E_BASE_URL is not set. Run the tests with `bun run e2e` at the project root.");

/** A unique string, so tests never depend on what an earlier run left in the database. */
export const unique = (prefix: string) => `${prefix} ${crypto.randomUUID().slice(0, 8)}`;

/** Opens a page on the app and records every error it raises. */
async function watch(context: BrowserContext): Promise<{ page: Page; errors: string[] }> {
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`uncaught: ${e.message}`));
  // "Failed to load resource" is the browser reporting a 4xx such as GET /api/auth/me signed out;
  // those are normal. Server errors are caught from the responses below.
  page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && errors.push(`console: ${m.text()}`));
  page.on("response", (r) => r.status() >= 500 && errors.push(`${r.status()} from ${r.request().method()} ${r.url()}`));
  return { page, errors };
}

/**
 * Runs `test` with fresh browser pages (separate contexts: separate cookies, like separate people).
 * Fails on any error the pages raised, and saves a screenshot of each page when anything fails.
 */
export async function withPages(name: string, count: number, test: (pages: Page[], url: (path: string) => string) => Promise<void>) {
  // One browser per test: bun runs every test file in one process, so a shared one would be closed by
  // the first file to finish.
  const browser = await chromium.launch();
  const watched = await Promise.all(Array.from({ length: count }, async () => watch(await browser.newContext({ baseURL: base }))));
  const pages = watched.map((w) => w.page);
  try {
    await test(pages, (path) => new URL(path, base).href);
    const errors = watched.flatMap((w) => w.errors);
    if (errors.length) throw new Error(`the page reported errors:\n  ${errors.join("\n  ")}`);
  } catch (err) {
    const dir = join(import.meta.dir, "results");
    mkdirSync(dir, { recursive: true });
    const shots = await Promise.all(
      pages.map(async (p, i) => {
        const file = join(dir, `${name.replace(/\W+/g, "-").replace(/^-|-$/g, "")}-${i + 1}.png`);
        await p.screenshot({ path: file, fullPage: true }).catch(() => {});
        return `${file} (${p.url()})`;
      }),
    );
    throw new Error(`${err instanceof Error ? err.message : err}\nScreenshots:\n  ${shots.join("\n  ")}`, { cause: err });
  } finally {
    await browser.close();
  }
}

/** Waits until React has hydrated and the page's first requests are done. */
export async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
}
