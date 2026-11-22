import { expect, test } from "bun:test";
import { publicPages } from "../app/seo";
import { settle, withPages } from "./browser";

// Every page opened cold, the way a visitor or a crawler arrives: it must render, hydrate and stay
// free of errors. Add a path here when you add a page.
const pages = [...publicPages, "/sign-in", "/app", "/app/todos"];

for (const path of pages) {
  test(`${path} loads and hydrates without errors`, () =>
    withPages(`page ${path}`, 1, async ([page]) => {
      const res = await page!.goto(path);
      expect(res?.status()).toBe(200);
      await settle(page!);
      expect(await page!.locator("h1").count()).toBeGreaterThan(0);
    }));
}

test("an unknown path shows the 404 page and is kept out of search results", () =>
  withPages("not found", 1, async ([page]) => {
    await page!.goto("/no-such-page");
    await page!.getByText("This page does not exist").waitFor();
    expect(await page!.locator('meta[name="robots"][content="noindex"]').count()).toBe(1);
  }));

test("the navigation links reach their pages", () =>
  withPages("navigation", 1, async ([page]) => {
    await page!.goto("/");
    await settle(page!);
    await page!.getByRole("link", { name: "How it works" }).first().click();
    await page!.waitForURL("**/how-it-works");
    await page!.getByRole("heading", { name: "How it works" }).waitFor();
  }));

test("the header's Sign in link stays put while moving between pages signed out", () =>
  withPages("no sign-in flicker", 1, async ([page]) => {
    await page!.goto("/app");
    await settle(page!);
    const header = page!.getByRole("banner");
    await header.getByRole("link", { name: "Sign in" }).waitFor();
    // Count every moment the link is missing from the header, however short.
    await page!.evaluate(() => {
      const w = window as unknown as { missing: number };
      w.missing = 0;
      const inHeader = () =>
        [...document.querySelectorAll("header a")].some((a) => a.textContent?.trim() === "Sign in");
      new MutationObserver(() => {
        if (!inHeader()) w.missing++;
      }).observe(document.body, { childList: true, subtree: true, characterData: true });
    });
    await page!.getByRole("navigation", { name: "Playground" }).getByRole("link", { name: "Todos" }).click();
    await page!.waitForURL("**/app/todos");
    await settle(page!);
    expect(await page!.evaluate(() => (window as unknown as { missing: number }).missing)).toBe(0);
  }));
