import { QueryClient } from "@tanstack/react-query";

/**
 * Global TanStack Query Client Configuration
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 1, // 1 minute fresh cache
      gcTime: 1000 * 60 * 5, // 5 minutes garbage collection
      retry: 1,
      refetchOnWindowFocus: false, // Prevent unnecessary refetches on tab switch
    },
    mutations: {
      retry: 0,
    },
  },
});
