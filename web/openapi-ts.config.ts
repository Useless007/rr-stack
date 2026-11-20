import { defineConfig } from "@hey-api/openapi-ts";

// RR_OPENAPI / RR_API_OUT let scripts/check.sh regenerate into a temp dir and diff against the committed client.
export default defineConfig({
  input: process.env.RR_OPENAPI ?? "../openapi.json",
  output: process.env.RR_API_OUT ?? "app/api",
  plugins: [
    "@hey-api/client-fetch",
    { name: "@tanstack/react-query", queryOptions: true, mutationOptions: true },
  ],
});
