// 401 handling lives in src/lib/api.js (request() hard-redirects to /login
// and returns undefined). TanStack Query v5 would treat undefined as an error
// ("Query data cannot be undefined"), but the page navigation unmounts the
// tree before that error surfaces. Do NOT add a QueryCache onError for 401
// here — it would double-redirect. If we ever switch to a soft (client-side)
// redirect for 401, revisit this and add explicit handling.

import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 0,
    },
  },
})
