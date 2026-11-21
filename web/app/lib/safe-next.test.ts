import { expect, test } from "bun:test";
import { safeNext } from "./safe-next";

const origin = "https://app.example.com";

test("keeps same-origin paths with their query and hash", () => {
  expect(safeNext("/app/todos/3?x=1#top", origin)).toBe("/app/todos/3?x=1#top");
});

test.each(["//evil.com", "/\\evil.com", "https://evil.com/app", "javascript:alert(1)", "app/todos", "", null])(
  "refuses %p and falls back",
  (raw) => {
    expect(safeNext(raw, origin)).toBe("/app/todos");
  },
);
