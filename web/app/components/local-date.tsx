import { useEffect, useState } from "react";
import { formatDate } from "~/lib/errors";

/**
 * A date in the visitor's language and time zone. Server-rendered HTML cannot know either, so the
 * first render (on the server, and the hydration pass) shows the plain ISO day and the local
 * format replaces it after mount. Otherwise hydration fails for anyone outside the server's locale.
 */
export function LocalDate({ iso }: { iso: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return <time dateTime={iso}>{mounted ? formatDate(iso) : iso.slice(0, 10)}</time>;
}
