import { useQuery } from "@tanstack/react-query";
import { healthOptions } from "~/api/@tanstack/react-query.gen";

export type ApiState = "checking" | "up" | "down";

/** Asks the real API from the browser, so a page can say whether the backend is running. */
export function useApiState(): ApiState {
  // Keeps asking while down: on the first `bun run dev` the Rust server is still compiling.
  const health = useQuery({ ...healthOptions(), retry: false, refetchInterval: (q) => (q.state.status === "error" ? 2000 : false) });
  if (health.isPending) return "checking";
  return health.isSuccess ? "up" : "down";
}

const copy: Record<ApiState, { dot: string; text: string }> = {
  checking: { dot: "bg-signal", text: "Checking the API" },
  up: { dot: "bg-patina", text: "The Rust API is running" },
  down: { dot: "bg-fault", text: "The API is not reachable yet. On the first bun run dev it is still compiling" },
};

export function ApiStatus({ state }: { state: ApiState }) {
  return (
    <p className="inline-flex items-center gap-2" role="status">
      <span aria-hidden className={`size-2.5 rounded-full ${copy[state].dot}`} />
      {copy[state].text}
    </p>
  );
}
