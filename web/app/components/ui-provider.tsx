import type { ReactNode } from "react";

/** Wraps the app in a component library's providers. Plain Tailwind needs none; `--astryx` apps replace this file. */
export function UiProvider({ children }: { children: ReactNode }) {
  return children;
}
