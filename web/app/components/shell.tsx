import { Link, NavLink } from "react-router";
import { useSession, useSignOut } from "./session";
import type { ReactNode } from "react";

export function Wordmark() {
  return (
    <Link to="/" className="text-lg font-semibold tracking-tight">
      RR<span className="text-patina-deep dark:text-patina">/</span>stack
    </Link>
  );
}

const nav = [
  { to: "/how-it-works", label: "How it works" },
  { to: "/api-reference", label: "API" },
  { to: "/app", label: "Playground" },
];

function Account() {
  const { user, loading } = useSession();
  const signOut = useSignOut();
  if (loading) return null;
  if (!user) {
    return (
      <NavLink to="/sign-in" className="muted -my-2 py-2 hover:text-ink dark:hover:text-paper">
        Sign in
      </NavLink>
    );
  }
  return (
    <span className="inline-flex items-baseline gap-3">
      <span className="muted max-w-40 truncate" title={user.email}>
        {user.email}
      </span>
      <button type="button" className="-my-2 py-2 underline decoration-patina underline-offset-4" onClick={() => signOut.mutate({})}>
        Sign out
      </button>
    </span>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-6 pb-24 pt-10 sm:pt-14">
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <Wordmark />
        <nav aria-label="Main" className="flex flex-wrap gap-x-5 text-sm">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `-my-2 py-2 ${isActive ? "font-medium text-ink underline decoration-patina decoration-2 underline-offset-8 dark:text-paper" : "muted hover:text-ink dark:hover:text-paper"}`
              }
            >
              {item.label}
            </NavLink>
          ))}
          <a className="muted -my-2 py-2 hover:text-ink dark:hover:text-paper" href="https://github.com/Useless007/rr-stack">
            GitHub
          </a>
          <Account />
        </nav>
      </header>
      <main>{children}</main>
      <footer className="mt-24 border-t border-ink/10 pt-6 text-base text-ink/80 dark:border-paper/10 dark:text-paper/80">
        Run <code className="font-mono">bun run check</code> before you call a change done. Exit 0 means every layer
        agrees.
      </footer>
    </div>
  );
}
