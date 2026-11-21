import { useState } from "react";
import { Link } from "react-router";
import { ApiStatus, useApiState } from "~/components/api-status";
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "RR stack: React Router and Rust, typed end to end" },
    { name: "description", content: "A starter for apps that AI agents write and people review. One command tells you whether every layer agrees." },
  ];
}

const command = "bun create rr-stack my-app";

function CopyCommand() {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-10 flex max-w-md items-center justify-between gap-3 rounded-lg border border-ink/15 bg-white py-2 pl-4 pr-2 dark:border-paper/15 dark:bg-ink-soft">
      <code className="font-mono text-[0.95rem]">
        <span aria-hidden className="select-none text-ink/50 dark:text-paper/50">$ </span>
        {command}
      </code>
      <button
        type="button"
        className="btn-quiet"
        onClick={() => navigator.clipboard.writeText(command).then(() => setCopied(true))}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

const reasons = [
  {
    title: "One answer to “is it done?”",
    body: "bun run check formats, lints, regenerates the contract, typechecks, builds and tests. Exit 0 means the SQL, the Rust API and the React screens agree.",
  },
  {
    title: "Mistakes surface at compile time",
    body: "SQLx checks queries against the real schema. The TypeScript client is generated from the Rust handlers, so a renamed field breaks the build, not production.",
  },
  {
    title: "One binary in production",
    body: "Axum serves the API and the built pages. Pages that search engines need are prerendered; the rest is a SPA. No Node process at runtime.",
  },
];

export default function Home() {
  const api = useApiState();
  return (
    <>
      <h1 className="mt-20 max-w-[16ch] text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
        React Router and Rust, typed from the database to the screen.
      </h1>
      <p className="muted mt-6 max-w-[58ch] text-lg leading-relaxed">
        A starter for apps that AI agents write and people review. Everything you see on this site, including the
        playground, ships in a new project.
      </p>
      <CopyCommand />
      <div className="mt-6 text-sm">
        <ApiStatus state={api} />
      </div>

      <div className="mt-20 grid gap-10 sm:grid-cols-3 sm:gap-8">
        {reasons.map((r) => (
          <section key={r.title}>
            <h2 className="font-semibold leading-snug">{r.title}</h2>
            <p className="muted mt-2 text-[0.95rem] leading-relaxed">{r.body}</p>
          </section>
        ))}
      </div>

      <div className="mt-16 flex flex-wrap gap-3">
        <Link className="btn" to="/app">
          Open the playground
        </Link>
        <Link className="btn-quiet !px-4 !py-2" to="/how-it-works">
          See how a change travels
        </Link>
      </div>
    </>
  );
}
