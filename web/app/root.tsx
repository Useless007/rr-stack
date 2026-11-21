import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Wordmark } from "./components/shell";
import type { Route } from "./+types/root";
import "./app.css";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Something broke";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "This page does not exist" : `Error ${error.status}`;
    details = error.status === 404 ? "The address may be mistyped, or the page was moved." : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="mx-auto max-w-3xl px-6 pb-24 pt-10 sm:pt-14">
      <Wordmark />
      <h1 className="mt-16 text-4xl font-semibold tracking-tight">{message}</h1>
      <p className="muted mt-3">{details}</p>
      {stack && (
        <pre className="mt-6 overflow-x-auto rounded-md bg-ink/5 p-4 font-mono text-sm dark:bg-paper/5">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
