import type { ApiError } from "~/api";

/** Text to show for a failed request: the API's own message when it sent an `ApiError`. */
export function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err && typeof (err as ApiError).message === "string") {
    return (err as ApiError).message;
  }
  return "The API did not answer. Is it running? Start it with bun run dev.";
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
}
