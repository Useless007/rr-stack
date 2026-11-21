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
  // No response means the API could not be reached.
  return data({ todo: res.data, error: res.error }, { status: res.response?.status ?? 502 });
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.todo?.title ?? "Todo"} · RR stack` }];
}

export default function TodoDetail({ loaderData }: Route.ComponentProps) {
  return <TodoPage id={Number(useParams().id)} initial={loaderData} />;
}
