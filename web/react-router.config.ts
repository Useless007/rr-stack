import type { Config } from "@react-router/dev/config";

// Paths listed in `prerender` become static HTML at build time (for SEO); every other route is SPA.
export default {
  ssr: false,
  prerender: ["/"],
} satisfies Config;
