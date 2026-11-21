import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";

// SITE_URL is baked into canonical links, share cards, robots.txt and sitemap.xml when the pages are
// built. Read from the environment first, then the project's .env (one folder up), then
// web/.env.production: a committed file, for hosts such as Vercel that pass no variables to a build.
function siteUrl(mode: string): string {
  const value =
    process.env.SITE_URL ||
    loadEnv(mode, "..", "SITE_URL").SITE_URL ||
    loadEnv(mode, ".", "SITE_URL").SITE_URL ||
    "http://localhost:3000";
  if (!URL.canParse(value) || !/^https?:$/.test(new URL(value).protocol)) {
    throw new Error(`SITE_URL must look like https://example.com, got "${value}"`);
  }
  return new URL(value).origin;
}

export default defineConfig(({ mode }) => ({
  define: { "import.meta.env.SITE_URL": JSON.stringify(siteUrl(mode)) },
  plugins: [tailwindcss(), reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    // Regex, not "/api": a plain prefix would also proxy /api-reference.
    // PORT comes from the project .env via bun run dev.
    proxy: { "^/api(/|$)": { target: `http://localhost:${process.env.PORT ?? "3000"}`, ws: true } },
    strictPort: true,
    // api-reference imports ../openapi.json at build time.
    fs: { allow: [".."] },
  },
}));
