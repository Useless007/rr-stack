import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { TodoEvent } from "~/api";

export type LiveState = "connecting" | "live" | "offline";

/**
 * Listens to `GET /api/events` (WebSocket). Any todo change, from this tab, another tab or another
 * person, refreshes the queries on screen. Reconnects with backoff when the server restarts.
 */
export function useLiveTodos(): { state: LiveState; last: TodoEvent | null } {
  const queryClient = useQueryClient();
  const [state, setState] = useState<LiveState>("connecting");
  const [last, setLast] = useState<TodoEvent | null>(null);

  useEffect(() => {
    let socket: WebSocket | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let delay = 500;
    let closed = false;

    const connect = () => {
      const url = new URL("/api/events", window.location.href);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(url);
      socket.onopen = () => {
        delay = 500;
        setState("live");
      };
      socket.onmessage = (msg) => {
        const event = JSON.parse(String(msg.data)) as TodoEvent;
        setLast(event);
        void queryClient.invalidateQueries();
      };
      socket.onclose = () => {
        if (closed) return;
        setState("offline");
        retry = setTimeout(connect, delay);
        delay = Math.min(delay * 2, 10_000);
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      socket?.close();
    };
  }, [queryClient]);

  return { state, last };
}

const copy: Record<LiveState, { dot: string; text: string }> = {
  connecting: { dot: "bg-signal", text: "Connecting" },
  live: { dot: "bg-patina", text: "Live" },
  offline: { dot: "bg-fault", text: "Offline, retrying" },
};

export function LiveBadge({ state, last }: { state: LiveState; last: TodoEvent | null }) {
  const what = last && (last.type === "deleted" ? `deleted #${last.id}` : `${last.type} "${last.todo.title}"`);
  return (
    <p className="muted inline-flex items-center gap-2 text-sm" role="status" aria-live="polite">
      <span aria-hidden className={`size-2 rounded-full ${copy[state].dot}`} />
      {copy[state].text}
      {what && <span className="hidden sm:inline">· last event: {what}</span>}
    </p>
  );
}
