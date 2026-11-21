import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { User } from "~/api";
import { logoutMutation, meOptions } from "~/api/@tanstack/react-query.gen";

/** The signed-in user, or null. A 401 from /api/auth/me simply means "signed out". */
export function useSession(): { user: User | null; loading: boolean } {
  const me = useQuery({ ...meOptions(), retry: false, staleTime: 60_000 });
  return { user: me.data ?? null, loading: me.isPending };
}

export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({ ...logoutMutation(), onSettled: () => queryClient.invalidateQueries() });
}
