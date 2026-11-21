import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { getStatsOptions, listTodosOptions } from "~/api/@tanstack/react-query.gen";
import { errorMessage, formatDate } from "~/lib/errors";

export default function Dashboard() {
  const stats = useQuery(getStatsOptions());
  const recent = useQuery(listTodosOptions());
  const s = stats.data;
  const pct = s && s.total > 0 ? Math.round((s.done / s.total) * 100) : 0;

  return (
    <div className="mt-10">
      {stats.error && (
        <p className="text-fault-deep dark:text-fault" role="alert">
          {errorMessage(stats.error)}
        </p>
      )}
      {s && (
        <section aria-labelledby="progress">
          <h2 id="progress" className="text-2xl font-semibold tracking-tight">
            {s.total === 0 ? "Nothing to do yet" : `${s.done} of ${s.total} done`}
          </h2>
          <div
            className="mt-4 h-2.5 overflow-hidden rounded-full bg-ink/10 dark:bg-paper/15"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Share of todos done"
          >
            <div className="h-full rounded-full bg-patina transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>
          <p className="muted mt-3 text-sm">
            {s.open} open, {s.done} done. Counted by one SQL query in <code className="font-mono">GET /api/stats</code>.
          </p>
        </section>
      )}

      <section className="mt-12" aria-labelledby="recent">
        <div className="flex items-baseline justify-between">
          <h2 id="recent" className="text-lg font-semibold">
            Latest
          </h2>
          <Link className="text-sm underline decoration-patina underline-offset-4" to="/app/todos">
            All todos
          </Link>
        </div>
        {recent.data?.length === 0 && (
          <p className="muted mt-4">
            No todos yet.{" "}
            <Link className="underline decoration-patina underline-offset-4" to="/app/todos">
              Add the first one
            </Link>
            .
          </p>
        )}
        {!!recent.data?.length && (
        <ul className="mt-4 divide-y divide-ink/10 border-y border-ink/10 dark:divide-paper/10 dark:border-paper/10">
          {recent.data?.slice(0, 5).map((t) => (
            <li key={t.id} className="flex items-baseline justify-between gap-4 py-3.5 leading-relaxed">
              <Link to={`/app/todos/${t.id}`} className={`hover:underline ${t.done ? "muted line-through" : ""}`}>
                {t.title}
              </Link>
              <time className="shrink-0 text-xs text-ink/65 dark:text-paper/60" dateTime={t.created_at}>
                {formatDate(t.created_at)}
              </time>
            </li>
          ))}
        </ul>
        )}
      </section>
    </div>
  );
}
