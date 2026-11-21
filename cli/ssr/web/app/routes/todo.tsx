import { data, useParams } from "react-router";
import { getTodo } from "~/api";
import { TodoPage } from "~/components/todo-page";
import type { Route } from "./+types/todo";

// Runs on the server: the first page load arrives as HTML with the todo in it, and client-side
// navigation fetches the same data as JSON. It calls the Rust API directly with the visitor's cookie.
export async function loader({ params, request }: Route.LoaderArgs) {
  const res = await getTodo({
    path: { id: Number(params.id) },
    baseUrl: process.env.API_URL ?? `http://127.0.0.1:${process.env.PORT ?? "3000"}`,
    headers: { cookie: request.headers.get("cookie") ?? "" },
  });
  if (res.data) return data({ todo: res.data, error: undefined });
  // A typed ApiError keeps the API's status (404, 400). Anything else, such as the API being down,
  // must not send its internal message or address to the browser.
  const status = res.response && res.response.status >= 400 ? res.response.status : 502;
  const apiError = res.error && typeof res.error === "object" && "error" in res.error ? res.error : undefined;
  const error = apiError ?? { error: "unavailable", message: "The API did not answer." };
  return data({ todo: undefined, error }, { status });
}

// The page is built with the visitor's cookie: a shared cache must never hand it to someone else.
export function headers() {
  return { "Cache-Control": "private, no-store" };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.todo?.title ?? "Todo"} · RR stack` }];
}

export default function TodoDetail({ loaderData }: Route.ComponentProps) {
  return <TodoPage id={Number(useParams().id)} initial={loaderData} />;
}
