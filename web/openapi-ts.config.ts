import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
  input: "../openapi.json",
  output: "app/api",
  plugins: [
    "@hey-api/client-fetch",
    { name: "@tanstack/react-query", queryOptions: true, mutationOptions: true },
  ],
});
