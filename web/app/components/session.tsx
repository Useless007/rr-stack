import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { User } from "~/api";
import { logoutMutation, meOptions, meQueryKey } from "~/api/@tanstack/react-query.gen";

/** The signed-in user, or null. A 401 from /api/auth/me simply means "signed out". */
export function useSession(): { user: User | null; loading: boolean } {
  const me = useQuery({ ...meOptions(), retry: false, staleTime: 60_000 });
  // TanStack Query keeps the last good data when a refetch fails; a failed /me means signed out.
  return { user: me.isError ? null : (me.data ?? null), loading: me.isPending };
}

export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    ...logoutMutation(),
    // reset (not remove): every component watching the session must hear that it ended.
    onSettled: () => queryClient.resetQueries({ queryKey: meQueryKey() }).then(() => queryClient.invalidateQueries()),
  });
}
