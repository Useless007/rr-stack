import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
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
});
