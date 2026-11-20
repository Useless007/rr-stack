import { Link } from "react-router";
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "RR stack" },
    { name: "description", content: "React + Rust, typed end to end." },
  ];
}

export default function Home() {
  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-3xl font-bold">RR stack</h1>
      <p className="mt-2">This page is prerendered at build time, so search engines see it.</p>
      <Link className="mt-4 inline-block underline" to="/app/todos">
        Open the app
      </Link>
    </main>
  );
}
