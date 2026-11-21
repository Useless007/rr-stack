import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import type { ApiError } from "~/api";
import { deleteTodoMutation, getTodoOptions, updateTodoMutation } from "~/api/@tanstack/react-query.gen";
import { errorMessage, formatDate } from "~/lib/errors";

export default function TodoDetail() {
  const id = Number(useParams().id);  // a non-number id reaches the API and comes back as a typed 400
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const todo = useQuery({ ...getTodoOptions({ path: { id } }), retry: false });
  const [draft, setDraft] = useState<string | null>(null);
  const save = useMutation({
    ...updateTodoMutation(),
    onSuccess: () => (setDraft(null), queryClient.invalidateQueries()),
  });
  // Separate from `save`, so ticking the box does not throw away a title being edited.
  const toggle = useMutation({ ...updateTodoMutation(), onSuccess: () => queryClient.invalidateQueries() });
  const remove = useMutation({
    ...deleteTodoMutation(),
    onSuccess: () => queryClient.invalidateQueries().then(() => navigate("/app/todos")),
  });

  const back = (
    <Link className="text-sm underline decoration-patina underline-offset-4" to="/app/todos">
      Back to todos
    </Link>
  );

  if (todo.isPending) return <p className="muted mt-10">Loading</p>;
  if (todo.error) {
    const notFound = (todo.error as ApiError | undefined)?.error === "not_found";
    return (
      <div className="mt-10">
        <h2 className="text-2xl font-semibold">{notFound ? `There is no todo #${id}` : "Could not load this todo"}</h2>
        <p className="muted mt-2">{notFound ? "It may have been deleted." : errorMessage(todo.error)}</p>
        <p className="mt-6">{back}</p>
      </div>
    );
  }

  const t = todo.data;
  return (
    <div className="mt-10 max-w-xl">
      {back}
      <form
        className="mt-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft !== null) save.mutate({ path: { id }, body: { title: draft } });
        }}
      >
        <label className="text-sm font-medium" htmlFor="title">
          Title
        </label>
        <div className="mt-2 flex gap-2">
          <input id="title" className="field flex-1" value={draft ?? t.title} onChange={(e) => setDraft(e.target.value)} />
          <button className="btn" type="submit" disabled={draft === null || save.isPending}>
            {save.isPending ? "Saving" : "Save"}
          </button>
        </div>
        {save.error && (
          <p className="mt-2 text-sm text-fault-deep dark:text-fault" role="alert">
            Not saved: {errorMessage(save.error)}
          </p>
        )}
      </form>

      <dl className="mt-8 grid grid-cols-[8rem_1fr] gap-y-3 text-sm">
        <dt className="muted">Status</dt>
        <dd>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              className="size-4 accent-patina-deep dark:accent-patina"
              checked={t.done}
              onChange={() => toggle.mutate({ path: { id }, body: { done: !t.done } })}
            />
            {t.done ? "Done" : "Open"}
          </label>
        </dd>
        <dt className="muted">Created</dt>
        <dd>
          <time dateTime={t.created_at}>{formatDate(t.created_at)}</time>
        </dd>
        <dt className="muted">Fetched with</dt>
        <dd>
          <code className="font-mono">GET /api/todos/{id}</code>
        </dd>
      </dl>

      <button
        type="button"
        className="mt-10 text-sm text-fault-deep underline underline-offset-4 dark:text-fault"
        onClick={() => remove.mutate({ path: { id } })}
        disabled={remove.isPending}
      >
        Delete this todo
      </button>
      {[toggle.error, remove.error].map(
        (error, i) =>
          error && (
            <p key={i} className="mt-2 text-sm text-fault-deep dark:text-fault" role="alert">
              {errorMessage(error)}
            </p>
          ),
      )}
    </div>
  );
}
