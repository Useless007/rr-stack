import { LinkProvider } from "@astryxdesign/core/Link";
import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import type { ComponentProps, ReactNode } from "react";
import { Link } from "react-router";

/** Astryx links take `href`; React Router's take `to`. This keeps navigation client-side. */
function RouterLink({ href, ...rest }: Omit<ComponentProps<typeof Link>, "to"> & { href: string }) {
  return <Link to={href} {...rest} />;
}

/** The Astryx theme (light and dark follow the system) and router-aware links for every component. */
export function UiProvider({ children }: { children: ReactNode }) {
  return (
    <Theme theme={neutralTheme} mode="system">
      <LinkProvider component={RouterLink}>{children}</LinkProvider>
    </Theme>
  );
}
