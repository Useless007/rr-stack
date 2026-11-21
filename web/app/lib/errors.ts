import type { ApiError } from "~/api";

/** Text to show for a failed request: the API's own message when it sent an `ApiError`. */
export function errorMessage(err: unknown): string {
  // An ApiError from our server has both fields; a network failure (TypeError) has only `message`.
  if (err && typeof err === "object" && "error" in err && "message" in err && typeof (err as ApiError).message === "string") {
    return (err as ApiError).message;
  }
  return "The API did not answer. Is it running? Start it with bun run dev.";
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
}
