import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-bold">Todos</h1>
      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate({ body: { title } });
        }}
      >
        <input
          className="flex-1 border px-2 py-1"
          aria-label="New todo"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button className="border px-3" type="submit" disabled={create.isPending}>
          Add
        </button>
      </form>
      {create.error && <p className="mt-2 text-red-600">{String(create.error)}</p>}
      {todos.isPending && <p className="mt-4">Loading…</p>}
      {todos.error && <p className="mt-4 text-red-600">Could not load todos.</p>}
      <ul className="mt-4 list-disc pl-6">
        {todos.data?.map((todo) => (
          <li key={todo.id}>{todo.title}</li>
        ))}
      </ul>
    </main>
  );
}
