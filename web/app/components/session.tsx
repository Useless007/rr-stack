import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { me as getMe, type User } from "~/api";
import { logoutMutation, meQueryKey } from "~/api/@tanstack/react-query.gen";

/**
 * The signed-in user, or null when signed out. "Signed out" (a 401 from /api/auth/me) is an answer,
 * not an error: it is cached like a user is, so moving between pages neither asks again nor blanks
 * the parts of the page that depend on it while it does.
 */
export function useSession(): { user: User | null; loading: boolean } {
  const me = useQuery({
    queryKey: meQueryKey(),
    queryFn: async ({ signal }): Promise<User | null> => {
      const res = await getMe({ signal });
      if (res.response?.status === 401) return null;
      if (res.error !== undefined || !res.data) throw res.error ?? new Error("could not load the session");
      return res.data;
    },
    retry: false,
    staleTime: 60_000,
  });
  return { user: me.data ?? null, loading: me.isPending };
}

export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    ...logoutMutation(),
    // reset (not remove): every component watching the session must hear that it ended.
    onSettled: () => queryClient.resetQueries({ queryKey: meQueryKey() }).then(() => queryClient.invalidateQueries()),
  });
}
