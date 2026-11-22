import { expect, test } from "bun:test";
import type { Page } from "playwright-core";
import { settle, unique, withPages } from "./browser";

async function signUp(page: Page) {
  await page.goto("/sign-in?new=1&next=/app/todos");
  await settle(page);
  await page.getByLabel("Email").fill(`${unique("e2e").replace(" ", "-")}@example.com`);
  await page.getByLabel("Password").fill("e2e-test-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/app/todos");
  await settle(page);
}

/** Clicks, and waits until the API has answered the write it caused. The page redraws before that. */
async function saved(page: Page, click: () => Promise<void>) {
  await Promise.all([
    page.waitForResponse((r) => new URL(r.url()).pathname.startsWith("/api/todos") && r.request().method() !== "GET" && r.ok()),
    click(),
  ]);
}

async function add(page: Page, title: string) {
  await page.getByLabel("New todo").fill(title);
  await page.getByRole("button", { name: "Add todo" }).click();
  await page.getByRole("link", { name: title }).waitFor();
}

test("sign up, add, complete, search, edit and delete a todo", () =>
  withPages("todo lifecycle", 1, async ([page]) => {
    await signUp(page!);
    const title = unique("Buy milk");
    await add(page!, title);

    // Completing survives a reload: it was saved by the API, not only drawn.
    await saved(page!, () => page!.getByRole("checkbox", { name: `Mark "${title}" as done` }).click());
    await page!.reload();
    await page!.getByRole("checkbox", { name: `Mark "${title}" as open` }).waitFor();

    // Search filters the list and goes into the URL, so the filtered list can be linked to.
    const other = unique("Walk the dog");
    await add(page!, other);
    await page!.getByLabel("Search todos").fill(title);
    await page!.waitForURL(/[?&]q=/);
    await page!.getByRole("link", { name: other }).waitFor({ state: "detached" });
    await page!.getByRole("link", { name: title }).waitFor();

    // The detail page edits the title.
    await page!.getByRole("link", { name: title }).click();
    await page!.waitForURL(/\/app\/todos\/\d+$/);
    const renamed = unique("Buy oat milk");
    await page!.getByLabel("Title").fill(renamed);
    await saved(page!, () => page!.getByRole("button", { name: "Save" }).click());
    await page!.reload();
    expect(await page!.getByLabel("Title").inputValue()).toBe(renamed);

    const detail = page!.url();
    await page!.getByRole("button", { name: "Delete this todo" }).click();
    await page!.waitForURL("**/app/todos");
    await page!.goto(detail);
    await page!.getByRole("heading", { name: /There is no todo #\d+/ }).waitFor();
  }));

test("a todo added in one browser appears in another without a reload", () =>
  withPages("realtime", 2, async ([author, reader]) => {
    await reader!.goto("/app/todos");
    // The socket connects after the page loads; an event sent before that would be missed.
    await reader!.getByRole("status").filter({ hasText: /^Live/ }).waitFor();
    await signUp(author!);
    const title = unique("Seen live");
    await add(author!, title);
    await reader!.getByRole("link", { name: title }).waitFor();
  }));

test("someone else's todo cannot be changed", () =>
  withPages("ownership", 2, async ([owner, other]) => {
    await signUp(owner!);
    const title = unique("Mine only");
    await add(owner!, title);
    await signUp(other!);
    await other!.getByLabel("Search todos").fill(title);
    const box = other!.getByRole("checkbox", { name: `Mark "${title}" as done` });
    expect(await box.isDisabled()).toBe(true);
    expect(await other!.getByRole("button", { name: `Delete "${title}"` }).count()).toBe(0);
  }));

test("signing out shows the signed-out page right away", () =>
  withPages("sign out", 1, async ([page]) => {
    await signUp(page!);
    const header = page!.getByRole("banner");
    await header.getByRole("button", { name: "Sign out" }).click();
    await header.getByRole("link", { name: "Sign in" }).waitFor();
    await page!.getByText("to add todos and change your own").waitFor();
    expect(await page!.getByLabel("New todo").count()).toBe(0);
  }));
