import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  route("robots.txt", "routes/robots.ts"),
  route("sitemap.xml", "routes/sitemap.ts"),
  layout("routes/site-layout.tsx", [
    index("routes/home.tsx"),
    route("how-it-works", "routes/how-it-works.tsx"),
    route("api-reference", "routes/api-reference.tsx"),
    route("sign-in", "routes/sign-in.tsx"),
    layout("routes/playground-layout.tsx", [
      route("app", "routes/dashboard.tsx"),
      route("app/todos", "routes/todos.tsx"),
      route("app/todos/:id", "routes/todo.tsx"),
    ]),
    route("*", "routes/not-found.tsx"),
  ]),
] satisfies RouteConfig;
