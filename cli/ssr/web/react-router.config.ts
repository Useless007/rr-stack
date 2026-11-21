import type { Config } from "@react-router/dev/config";
import { publicPages } from "./app/seo";

// Every route renders on the server (web/server.ts) and then hydrates. Paths in `prerender` are
// rendered once at build time instead and served as files.
export default {
  ssr: true,
  prerender: [...publicPages, "/robots.txt", "/sitemap.xml"],
} satisfies Config;
