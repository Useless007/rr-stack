import { NavLink, Outlet } from "react-router";
import { LiveBadge, useLiveTodos } from "~/components/live";

export default function PlaygroundLayout() {
  const live = useLiveTodos();
  return (
    <>
      {/* Signed-in pages stay out of search results. React moves this tag into <head>. */}
      <meta name="robots" content="noindex" />
      <div className="mt-16 flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-4xl font-semibold tracking-tight">Playground</h1>
        <nav aria-label="Playground" className="flex gap-1 rounded-lg bg-ink/5 p-1 text-sm dark:bg-paper/10">
          {[
            { to: "/app", label: "Overview", end: true },
            { to: "/app/todos", label: "Todos", end: false },
          ].map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `rounded-md px-3 py-1.5 ${isActive ? "bg-white font-medium shadow-sm dark:bg-ink-soft" : "muted hover:text-ink dark:hover:text-paper"}`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <p className="muted mt-3 max-w-[60ch]">
        A live app on the real API. Every request goes through the client generated in{" "}
        <code className="font-mono text-[0.9em]">web/app/api</code>. Open it in two tabs: a change in
        one appears in the other through a WebSocket.
      </p>
      <div className="mt-3">
        <LiveBadge {...live} />
      </div>
      <Outlet />
    </>
  );
}
