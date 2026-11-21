import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { createTodoMutation, listTodosOptions, listTodosQueryKey } from "~/api/@tanstack/react-query.gen";

export default function Todos() {
  const queryClient = useQueryClient();
  const todos = useQuery(listTodosOptions());
  const [title, setTitle] = useState("");
  const create = useMutation({
    ...createTodoMutation(),
    onSuccess: () => {
      setTitle("");
      return queryClient.invalidateQueries({ queryKey: listTodosQueryKey() });
    },
  });

  return (
    <main className="mx-auto max-w-xl px-6 pb-24 pt-16">
      <Link className="text-sm text-ink/60 hover:text-ink dark:text-paper/60 dark:hover:text-paper" to="/">
        RR/stack
      </Link>
      <h1 className="mt-8 text-4xl font-semibold tracking-tight">Todos</h1>
      <p className="mt-2 text-ink/70 dark:text-paper/70">
        Every request here goes through the generated client in <code className="font-mono text-sm">~/api</code>.
      </p>

      <form
        className="mt-8 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate({ body: { title } });
        }}
      >
        <label className="sr-only" htmlFor="title">
          New todo
        </label>
        <input
          id="title"
          className="min-w-0 flex-1 rounded-md border border-ink/20 bg-white px-3 py-2 outline-none focus:border-patina-deep dark:border-paper/20 dark:bg-ink-soft dark:focus:border-patina"
          placeholder="What needs doing?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button
          className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink-soft disabled:opacity-60 dark:bg-paper dark:text-ink"
          type="submit"
          disabled={create.isPending}
        >
          {create.isPending ? "Adding" : "Add todo"}
        </button>
      </form>
      {create.error && (
        <p className="mt-3 text-sm text-fault" role="alert">
          Not added. {String(create.error)}
        </p>
      )}

      <section className="mt-10" aria-live="polite">
        {todos.isPending && <p className="text-ink/60 dark:text-paper/60">Loading todos</p>}
        {todos.error && (
          <p className="text-fault" role="alert">
            Could not load todos. Is the API running? Start it with <code className="font-mono">bun run dev</code>.
          </p>
        )}
        {todos.data?.length === 0 && (
          <p className="text-ink/60 dark:text-paper/60">No todos yet. Add the first one above.</p>
        )}
        {todos.data && todos.data.length > 0 && (
          <ul className="divide-y divide-ink/10 border-y border-ink/10 dark:divide-paper/10 dark:border-paper/10">
            {todos.data.map((todo) => (
              <li key={todo.id} className="flex items-baseline justify-between gap-4 py-3">
                <span>{todo.title}</span>
                <time className="shrink-0 text-xs text-ink/50 dark:text-paper/50" dateTime={todo.created_at}>
                  {new Date(todo.created_at).toLocaleDateString()}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
