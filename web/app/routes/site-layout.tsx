import { Outlet } from "react-router";
import { Shell } from "~/components/shell";

export default function SiteLayout() {
  return (
    <Shell>
      <Outlet />
    </Shell>
  );
}
