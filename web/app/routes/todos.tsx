import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import type { Todo } from "~/api";
import {
  createTodoMutation,
  deleteTodoMutation,
  listTodosOptions,
  updateTodoMutation,
} from "~/api/@tanstack/react-query.gen";
import { errorMessage, formatDate } from "~/lib/errors";

const tabs = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "done", label: "Done" },
] as const;
type Status = (typeof tabs)[number]["value"];

export default function Todos() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const status: Status = tabs.some((t) => t.value === params.get("status")) ? (params.get("status") as Status) : "all";
  const q = params.get("q") ?? "";

  // The filter lives in the URL, so a filtered list can be shared or reloaded.
  const listQuery = listTodosOptions({ query: { status, q: q || undefined } });
  const todos = useQuery(listQuery);
  const refresh = () => queryClient.invalidateQueries();

  const [title, setTitle] = useState("");
  const create = useMutation({ ...createTodoMutation(), onSuccess: () => (setTitle(""), refresh()) });
  const remove = useMutation({ ...deleteTodoMutation(), onSettled: refresh });
  const toggle = useMutation({
    ...updateTodoMutation(),
    // Optimistic: tick the box at once, roll back if the API refuses.
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: listQuery.queryKey });
      const before = queryClient.getQueryData<Todo[]>(listQuery.queryKey);
      queryClient.setQueryData<Todo[]>(listQuery.queryKey, (list) =>
        list?.map((t) => (t.id === vars.path.id ? { ...t, done: vars.body.done ?? t.done } : t)),
      );
      return { before };
    },
    onError: (_err, _vars, ctx) => queryClient.setQueryData(listQuery.queryKey, ctx?.before),
    onSettled: refresh,
  });

  const [search, setSearch] = useState(q);
  useEffect(() => {
    const id = setTimeout(() => {
      if (search === q) return;
      setParams((p) => (search ? p.set("q", search) : p.delete("q"), p), { replace: true });
    }, 250);
    return () => clearTimeout(id);
  }, [search, q, setParams]);

  return (
    <div className="mt-10 max-w-xl">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate({ body: { title } });
        }}
      >
        <label className="sr-only" htmlFor="new-title">
          New todo
        </label>
        <input
          id="new-title"
          className="field flex-1"
          placeholder="What needs doing?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button className="btn" type="submit" disabled={create.isPending}>
          {create.isPending ? "Adding" : "Add todo"}
        </button>
      </form>
      {create.error && (
        <p className="mt-2 text-sm text-fault-deep dark:text-fault" role="alert">
          Not added: {errorMessage(create.error)}
        </p>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Filter by status" className="flex gap-1 rounded-lg bg-ink/5 p-1 text-sm dark:bg-paper/10">
          {tabs.map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={status === t.value}
              className={`rounded-md px-3 py-1 ${status === t.value ? "bg-white font-medium shadow-sm dark:bg-ink-soft" : "muted"}`}
              onClick={() => setParams((p) => (t.value === "all" ? p.delete("status") : p.set("status", t.value), p))}
            >
              {t.label}
            </button>
          ))}
        </div>
        <label className="sr-only" htmlFor="search">
          Search todos
        </label>
        <input
          id="search"
          type="search"
          className="field w-48 py-1.5 text-sm"
          placeholder="Search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <section className="mt-4" aria-live="polite">
        {todos.isPending && <p className="muted py-4">Loading todos</p>}
        {todos.error && (
          <p className="py-4 text-fault-deep dark:text-fault" role="alert">
            {errorMessage(todos.error)}
          </p>
        )}
        {todos.data?.length === 0 && (
          <p className="muted py-4">{q || status !== "all" ? "Nothing matches this filter." : "No todos yet. Add the first one above."}</p>
        )}
        <ul className="divide-y divide-ink/10 dark:divide-paper/10">
          {todos.data?.map((todo) => (
            <li key={todo.id} className="flex items-center gap-3 py-3.5 leading-relaxed">
              <input
                type="checkbox"
                className="size-4 shrink-0 accent-patina-deep dark:accent-patina"
                checked={todo.done}
                aria-label={`Mark "${todo.title}" as ${todo.done ? "open" : "done"}`}
                onChange={() => toggle.mutate({ path: { id: todo.id }, body: { done: !todo.done } })}
              />
              <Link to={`/app/todos/${todo.id}`} className={`min-w-0 flex-1 hover:underline ${todo.done ? "muted line-through" : ""}`}>
                {todo.title}
              </Link>
              <time className="hidden shrink-0 text-xs text-ink/65 sm:block dark:text-paper/60" dateTime={todo.created_at}>
                {formatDate(todo.created_at)}
              </time>
              <button
                type="button"
                className="shrink-0 rounded px-2 py-1 text-sm text-ink/65 hover:bg-fault/10 hover:text-fault-deep dark:text-paper/60 dark:hover:text-fault"
                onClick={() => remove.mutate({ path: { id: todo.id } })}
                aria-label={`Delete "${todo.title}"`}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
