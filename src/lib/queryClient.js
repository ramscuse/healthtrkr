import { QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";

// 401s are handled in request() (src/lib/api.js): it hard-redirects to /login
// and returns undefined; the navigation unmounts the tree before Query surfaces
// the "data cannot be undefined" error. Do NOT add a QueryCache onError for 401
// here (double redirect). Revisit if 401 ever becomes a soft client redirect.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

// useMutation that invalidates `keys` — or `keys(variables)` — on success.
export function useInvalidatingMutation(mutationFn, keys) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (_, variables) => {
      for (const queryKey of typeof keys === "function" ? keys(variables) : keys) {
        client.invalidateQueries({ queryKey });
      }
    },
  });
}
