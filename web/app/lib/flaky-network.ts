// Used by e2e/browser.ts; it lives here so `bun run check` runs its test.

/**
 * True when a test failed only because this machine's network changed under it: Chromium aborts every
 * request in flight with net::ERR_NETWORK_CHANGED when an interface comes or goes, which Docker does
 * whenever it starts or stops a container network. That says nothing about the app, so the test is
 * worth one more try. Any other error, even beside it, is a real failure.
 */
export function onlyNetworkChanged(message: string, pageErrors: string[]): boolean {
  const changed = (text: string) => text.includes("net::ERR_NETWORK_CHANGED");
  const reported = message.startsWith("the page reported errors");
  return (reported || changed(message)) && pageErrors.every(changed) && (changed(message) || pageErrors.length > 0);
}
