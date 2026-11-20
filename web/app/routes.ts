import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("app/todos", "routes/todos.tsx"),
] satisfies RouteConfig;
