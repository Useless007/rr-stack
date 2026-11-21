const fallback = "/app/todos";

/**
 * Where to go after signing in. Only a path on this site is accepted, so a link like
 * `/sign-in?next=//evil.com` cannot send a freshly signed-in user to another site.
 */
export function safeNext(raw: string | null, origin: string): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  try {
    const url = new URL(raw, origin);
    return url.origin === origin ? url.pathname + url.search + url.hash : fallback;
  } catch {
    return fallback;
  }
}
