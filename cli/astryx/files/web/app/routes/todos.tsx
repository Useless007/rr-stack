import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { List, ListItem } from "@astryxdesign/core/List";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import type { Todo } from "~/api";
import {
  createTodoMutation,
  deleteTodoMutation,
  listTodosOptions,
  updateTodoMutation,
} from "~/api/@tanstack/react-query.gen";
import { LocalDate } from "~/components/local-date";
import { useSession } from "~/components/session";
import { errorMessage } from "~/lib/errors";

const tabs = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "done", label: "Done" },
] as const;
type Status = (typeof tabs)[number]["value"];

export default function Todos() {
  const queryClient = useQueryClient();
  const { user } = useSession();
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
  // Follow the URL when it changes from outside (tab, Back), so the box never writes a stale q back.
  const [seenQ, setSeenQ] = useState(q);
  if (q !== seenQ) {
    setSeenQ(q);
    setSearch(q);
  }
  useEffect(() => {
    const id = setTimeout(() => {
      if (search === q) return;
      setParams((p) => (search ? p.set("q", search) : p.delete("q"), p), { replace: true });
    }, 250);
    return () => clearTimeout(id);
  }, [search, q, setParams]);

  return (
    <VStack gap={6} paddingBlockStart={8} maxWidth={576}>
      {!user && (
        <Banner
          status="info"
          title="Anyone can read the list"
          description="Sign in to add todos and change your own."
          endContent={<Button href="/sign-in?next=/app/todos" label="Sign in" size="sm" />}
        />
      )}
      {user && (
        <HStack
          as="form"
          gap={2}
          align="end"
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
            create.mutate({ body: { title } });
          }}
        >
          <TextInput label="New todo" isLabelHidden placeholder="What needs doing?" value={title} onChange={setTitle} containerClassName="min-w-0 flex-1" />
          <Button type="submit" variant="primary" label="Add todo" isLoading={create.isPending} />
        </HStack>
      )}
      {[
        { error: create.error, what: "Not added" },
        { error: toggle.error, what: "Not updated" },
        { error: remove.error, what: "Not deleted" },
      ].map(({ error, what }) => error && <Banner key={what} role="alert" status="error" title={`${what}: ${errorMessage(error)}`} />)}

      <HStack gap={3} justify="between" align="center" wrap="wrap">
        <SegmentedControl
          label="Filter by status"
          value={status}
          onChange={(v) => setParams((p) => (v === "all" ? p.delete("status") : p.set("status", v), p))}
        >
          {tabs.map((t) => (
            <SegmentedControlItem key={t.value} value={t.value} label={t.label} />
          ))}
        </SegmentedControl>
        <TextInput label="Search todos" isLabelHidden type="search" startIcon="search" placeholder="Search" size="sm" value={search} onChange={setSearch} width={192} />
      </HStack>

      <VStack as="section" aria-live="polite">
        {todos.isPending && <Spinner label="Loading todos" />}
        {todos.error && <Banner status="error" title={errorMessage(todos.error)} />}
        {todos.data?.length === 0 && (
          <EmptyState
            title={q || status !== "all" ? "Nothing matches this filter" : "No todos yet"}
            description={q || status !== "all" ? undefined : user ? "Add the first one above." : undefined}
            isCompact
          />
        )}
        {!!todos.data?.length && (
          <List hasDividers>
            {todos.data.map((todo) => {
              const mine = !!user && todo.owner_id === user.id;
              return (
                <ListItem
                  key={todo.id}
                  itemKey={todo.id}
                  startContent={
                    <CheckboxInput
                      label={`Mark "${todo.title}" as ${todo.done ? "open" : "done"}`}
                      isLabelHidden
                      value={todo.done}
                      isDisabled={!mine}
                      disabledMessage={mine ? undefined : "Only the person who added it can change it"}
                      onChange={() => toggle.mutate({ path: { id: todo.id }, body: { done: !todo.done } })}
                    />
                  }
                  label={
                    <Link href={`/app/todos/${todo.id}`}>
                      <Text hasStrikethrough={todo.done} color={todo.done ? "secondary" : "inherit"}>
                        {todo.title}
                      </Text>
                    </Link>
                  }
                  endContent={
                    <HStack gap={3} align="center">
                      <Text color="secondary" size="xsm">
                        <LocalDate iso={todo.created_at} />
                      </Text>
                      {mine && (
                        <Button
                          variant="ghost"
                          size="sm"
                          label={`Delete "${todo.title}"`}
                          onClick={() => remove.mutate({ path: { id: todo.id } })}
                        >
                          Delete
                        </Button>
                      )}
                    </HStack>
                  }
                />
              );
            })}
          </List>
        )}
      </VStack>
    </VStack>
  );
}
