import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "RR stack" },
    { name: "description", content: "React Router and Rust, typed from the database to the screen." },
  ];
}

type Health = "checking" | "up" | "down";

/** Asks the real API, from the browser, so the page tells you whether the backend is running. */
function useApiHealth(): Health {
  const [health, setHealth] = useState<Health>("checking");
  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/health", { signal: ctrl.signal })
      .then((r) => setHealth(r.ok ? "up" : "down"))
      .catch(() => !ctrl.signal.aborted && setHealth("down"));
    return () => ctrl.abort();
  }, []);
  return health;
}

const layers = [
  { name: "Postgres", file: "server/migrations/0001_todos.sql", says: "Tables live here. SQLx checks every query against them when Rust compiles." },
  { name: "Rust API", file: "server/src/todos.rs", says: "Axum handlers. Their types become the API contract." },
  { name: "Contract", file: "openapi.json", says: "Generated from the handlers. Never edited by hand." },
  { name: "React", file: "web/app/routes/todos.tsx", says: "Uses a client generated from the contract, so a renamed field fails the build." },
] as const;

const healthCopy: Record<Health, { dot: string; text: string }> = {
  checking: { dot: "bg-signal", text: "Checking the API" },
  up: { dot: "bg-patina", text: "API is running" },
  down: { dot: "bg-fault", text: "API is not reachable. Start it with bun run dev" },
};

export default function Home() {
  const health = useApiHealth();
  return (
    <main className="mx-auto max-w-3xl px-6 pb-24 pt-16 sm:pt-24">
      <header className="flex items-baseline justify-between gap-4">
        <span className="text-lg font-semibold tracking-tight">
          RR<span className="text-patina-deep dark:text-patina">/</span>stack
        </span>
        <nav className="flex gap-5 text-sm text-ink/70 dark:text-paper/70">
          <a className="hover:text-ink dark:hover:text-paper" href="https://github.com/Useless007/rr-stack">
            GitHub
          </a>
          <a className="hover:text-ink dark:hover:text-paper" href="/api/health">
            API health
          </a>
        </nav>
      </header>

      <h1 className="mt-20 max-w-[15ch] text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
        Typed from the database to the screen.
      </h1>
      <p className="mt-6 max-w-[60ch] text-lg leading-relaxed text-ink/75 dark:text-paper/75">
        Edit <code className="font-mono text-[0.9em]">web/app/routes/home.tsx</code> and save. This page is
        prerendered at build time, so search engines read it. The rest of the app is a SPA served by the same
        Rust binary.
      </p>

      {/* The chain fills in once the browser reaches the real API: the one moment of motion on the page. */}
      <ol className="mt-16" aria-label="How a change travels through the stack">
        {layers.map((layer, i) => (
          <li key={layer.name} className="relative grid grid-cols-[1.5rem_1fr] gap-x-5 pb-10 last:pb-0">
            {i < layers.length - 1 && (
              <span
                aria-hidden
                className={`absolute left-[0.6875rem] top-6 h-full w-px transition-colors duration-700 ${health === "up" ? "bg-patina" : "bg-ink/15 dark:bg-paper/15"}`}
              />
            )}
            <span
              aria-hidden
              className={`relative mt-1.5 size-6 rounded-full border-2 border-patina-deep transition-colors duration-700 dark:border-patina ${health === "up" ? "bg-patina" : "bg-paper dark:bg-ink"}`}
            />
            <div>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-xl font-semibold">{layer.name}</h2>
                <code className="font-mono text-sm text-patina-deep dark:text-patina">{layer.file}</code>
              </div>
              <p className="mt-1.5 max-w-[56ch] leading-relaxed text-ink/70 dark:text-paper/70">{layer.says}</p>
              {layer.name === "Rust API" && (
                <p className="mt-3 inline-flex items-center gap-2 text-sm" role="status">
                  <span className={`size-2 rounded-full ${healthCopy[health].dot}`} />
                  {healthCopy[health].text}
                </p>
              )}
              {layer.name === "React" && (
                <Link
                  className="mt-4 inline-block rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink-soft dark:bg-paper dark:text-ink dark:hover:bg-white"
                  to="/app/todos"
                >
                  Open the todo app
                </Link>
              )}
            </div>
          </li>
        ))}
      </ol>

      <footer className="mt-20 border-t border-ink/10 pt-6 text-sm text-ink/60 dark:border-paper/10 dark:text-paper/60">
        Run <code className="font-mono text-ink dark:text-paper">bun run check</code> before you call a change done.
        Exit 0 means every layer above agrees.
      </footer>
    </main>
  );
}
