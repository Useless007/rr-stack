import { expect, test } from "bun:test";
import { onlyNetworkChanged } from "./flaky-network";

test("a test that failed only because the machine's network changed is worth one more try", () => {
  expect(onlyNetworkChanged("goto: net::ERR_NETWORK_CHANGED at http://127.0.0.1:3000/", [])).toBe(true);
  expect(
    onlyNetworkChanged("the page reported errors:\n  failed: http://x/assets/a.js net::ERR_NETWORK_CHANGED", [
      "failed: http://x/assets/a.js net::ERR_NETWORK_CHANGED",
      "failed: http://x/assets/b.js net::ERR_NETWORK_CHANGED",
    ]),
  ).toBe(true);
});

test("any other error, alone or beside a network change, is a real failure", () => {
  expect(onlyNetworkChanged("expect(received).toBe(expected)", [])).toBe(false);
  expect(onlyNetworkChanged("the page reported errors", ["failed: http://x/a.js net::ERR_NETWORK_CHANGED", "uncaught: boom"])).toBe(false);
  expect(onlyNetworkChanged("goto: net::ERR_NETWORK_CHANGED", ["500 from GET http://x/api/todos"])).toBe(false);
  expect(onlyNetworkChanged("goto: net::ERR_CONNECTION_REFUSED", [])).toBe(false);
});
