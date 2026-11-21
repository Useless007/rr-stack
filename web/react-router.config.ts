import type { Config } from "@react-router/dev/config";
import { publicPages } from "./app/seo";

// Paths listed in `prerender` become static HTML at build time; every other route is SPA.
// Public pages are listed once, in app/seo.ts (they also go into sitemap.xml).
export default {
  ssr: false,
  prerender: [...publicPages, "/robots.txt", "/sitemap.xml"],
} satisfies Config;
