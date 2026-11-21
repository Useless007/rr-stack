import { ApiStatus, useApiState } from "~/components/api-status";
import type { Route } from "./+types/how-it-works";
import { seo } from "~/seo";

export function meta({}: Route.MetaArgs) {
  return seo({
    title: "How it works · RR stack",
    description: "Postgres, the Rust API, openapi.json and React: four layers, each generated from or checked against the one before it.",
    path: "/how-it-works",
  });
}

const layers = [
  { name: "Postgres", file: "server/migrations/0001_todos.sql", says: "Tables live here. SQLx checks every query against them when Rust compiles." },
  { name: "Rust API", file: "server/src/todos.rs", says: "Axum handlers. Their request and response types become the API contract." },
  { name: "Contract", file: "openapi.json", says: "Generated from the handlers by bun run gen. Never edited by hand." },
  { name: "React", file: "web/app/routes/todos.tsx", says: "Uses hooks generated from the contract, so a renamed field fails the build." },
] as const;

const steps = [
  "Add a migration, or a query with query! — SQLx checks it against the schema.",
  "Change the handler and its ToSchema types, then register the route in api_router().",
  "Run bun run gen. openapi.json and web/app/api/ are rewritten from the handlers.",
  "Use the generated Options() or Mutation() hook in a route.",
  "Run bun run check. If any layer disagrees with another, this is where it fails.",
  "Need realtime? Send an event on the broadcast channel in AppState; every open page gets it over /api/events.",
];

export default function HowItWorks() {
  const api = useApiState();
  return (
    <>
      <h1 className="mt-16 text-4xl font-semibold tracking-tight">How it works</h1>
      <p className="muted mt-4 max-w-[60ch] text-lg leading-relaxed">
        Four layers, each generated from or checked against the one before it. The chain fills in once this page
        reaches the live API.
      </p>

      <ol className="mt-12" aria-label="The layers of the stack">
        {layers.map((layer, i) => (
          <li key={layer.name} className="relative grid grid-cols-[1.5rem_1fr] gap-x-5 pb-10 last:pb-0">
            {i < layers.length - 1 && (
              <span
                aria-hidden
                className={`absolute left-[0.6875rem] top-6 h-full w-px transition-colors duration-700 ${api === "up" ? "bg-patina" : "bg-ink/15 dark:bg-paper/15"}`}
              />
            )}
            <span
              aria-hidden
              className={`relative mt-1.5 size-6 rounded-full border-2 border-patina-deep transition-colors duration-700 dark:border-patina ${api === "up" ? "bg-patina" : "bg-paper dark:bg-ink"}`}
            />
            <div>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-xl font-semibold">{layer.name}</h2>
                <code className="path">{layer.file}</code>
              </div>
              <p className="muted mt-1.5 max-w-[56ch] leading-relaxed">{layer.says}</p>
              {layer.name === "Rust API" && (
                <div className="mt-3 text-sm">
                  <ApiStatus state={api} />
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>

      <h2 className="mt-20 text-2xl font-semibold tracking-tight">Adding a feature</h2>
      <ol className="mt-6 list-decimal space-y-3 pl-6 marker:font-mono marker:text-patina-deep dark:marker:text-patina">
        {steps.map((s) => (
          <li key={s} className="pl-2 leading-relaxed">
            {s}
          </li>
        ))}
      </ol>
    </>
  );
}
