import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Code } from "@astryxdesign/core/Code";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import type { ApiError, Todo } from "~/api";
import { deleteTodoMutation, getTodoOptions, updateTodoMutation } from "~/api/@tanstack/react-query.gen";
import { LocalDate } from "~/components/local-date";
import { useSession } from "~/components/session";
import { errorMessage } from "~/lib/errors";

/** `initial` is what a server loader already fetched (--ssr apps); without it the page fetches in the browser. */
export function TodoPage({ id, initial }: { id: number; initial?: { todo?: Todo; error?: ApiError } }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useSession();
  // Server data is fresh for a moment, so hydrating does not fetch the same todo again.
  const todo = useQuery({
    ...getTodoOptions({ path: { id } }),
    retry: false,
    initialData: initial?.todo,
    staleTime: initial?.todo ? 10_000 : 0,
  });
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

  const back = <Link href="/app/todos">Back to todos</Link>;

  const error = todo.error ?? (todo.isPending ? initial?.error : null);
  if (error) {
    const notFound = (error as ApiError | undefined)?.error === "not_found";
    return (
      <VStack gap={4} paddingBlockStart={8} hAlign="start">
        <EmptyState
          title={notFound ? `There is no todo #${id}` : "Could not load this todo"}
          description={notFound ? "It may have been deleted." : errorMessage(error)}
          actions={back}
          headingLevel={2}
        />
      </VStack>
    );
  }
  if (!todo.data) return <Spinner label="Loading" />;

  const t = todo.data;
  const mine = !!user && t.owner_id === user.id;
  return (
    <VStack gap={6} paddingBlockStart={8} maxWidth={576}>
      {back}
      <VStack
        as="form"
        gap={2}
        onSubmit={(e: React.FormEvent) => {
          e.preventDefault();
          if (draft !== null) save.mutate({ path: { id }, body: { title: draft } });
        }}
      >
        <HStack gap={2} align="end">
          <TextInput label="Title" value={draft ?? t.title} isReadOnly={!mine} onChange={setDraft} containerClassName="min-w-0 flex-1" />
          <Button type="submit" label="Save" isDisabled={!mine || draft === null} isLoading={save.isPending} />
        </HStack>
        {save.error && <Banner status="error" title={`Not saved: ${errorMessage(save.error)}`} />}
      </VStack>

      <MetadataList>
        <MetadataListItem label="Status">
          <CheckboxInput
            label={t.done ? "Done" : "Open"}
            value={t.done}
            isDisabled={!mine}
            onChange={() => toggle.mutate({ path: { id }, body: { done: !t.done } })}
          />
        </MetadataListItem>
        <MetadataListItem label="Created">
          <LocalDate iso={t.created_at} />
        </MetadataListItem>
        <MetadataListItem label="Fetched with">
          <Code>GET /api/todos/{id}</Code>
        </MetadataListItem>
      </MetadataList>

      {!mine && (
        <Text color="secondary">
          {user ? "Only the person who added this todo can change it." : "Sign in to change your own todos."}
        </Text>
      )}
      {mine && (
        <HStack>
          <Button variant="destructive" label="Delete this todo" onClick={() => remove.mutate({ path: { id } })} isLoading={remove.isPending} />
        </HStack>
      )}
      {[toggle.error, remove.error].map((error, i) => error && <Banner key={i} status="error" title={errorMessage(error)} />)}
    </VStack>
  );
}
