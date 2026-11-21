import { Banner } from "@astryxdesign/core/Banner";
import { Code } from "@astryxdesign/core/Code";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { List, ListItem } from "@astryxdesign/core/List";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useQuery } from "@tanstack/react-query";
import { getStatsOptions, listTodosOptions } from "~/api/@tanstack/react-query.gen";
import { LocalDate } from "~/components/local-date";
import { errorMessage } from "~/lib/errors";

export default function Dashboard() {
  const stats = useQuery(getStatsOptions());
  const recent = useQuery(listTodosOptions());
  const s = stats.data;

  return (
    <VStack gap={10} paddingBlockStart={8}>
      {stats.error && <Banner status="error" title={errorMessage(stats.error)} />}
      {s && (
        <VStack gap={3} as="section">
          <Heading level={2}>{s.total === 0 ? "Nothing to do yet" : `${s.done} of ${s.total} done`}</Heading>
          <ProgressBar label="Share of todos done" isLabelHidden value={s.done} max={Math.max(s.total, 1)} variant="success" />
          <Text color="secondary">
            {s.open} open, {s.done} done. Counted by one SQL query in <Code>GET /api/stats</Code>.
          </Text>
        </VStack>
      )}

      <VStack gap={3} as="section">
        <HStack justify="between" align="center">
          <Heading level={3}>Latest</Heading>
          <Link href="/app/todos">All todos</Link>
        </HStack>
        {recent.data?.length === 0 && (
          <EmptyState title="No todos yet" description="Add the first one on the Todos tab." isCompact />
        )}
        {!!recent.data?.length && (
          <List hasDividers>
            {recent.data.slice(0, 5).map((t) => (
              <ListItem
                key={t.id}
                itemKey={t.id}
                href={`/app/todos/${t.id}`}
                label={<Text hasStrikethrough={t.done} color={t.done ? "secondary" : "primary"}>{t.title}</Text>}
                endContent={<Text color="secondary"><LocalDate iso={t.created_at} /></Text>}
              />
            ))}
          </List>
        )}
      </VStack>
    </VStack>
  );
}
