'use client';

import { QueryClient } from '@tanstack/react-query';

/**
 * React Query client configuration for Constitutional AI
 *
 * Caching strategy:
 * - staleTime: 60s (searches are relatively stable)
 * - gcTime: 5min (garbage collection after unmount)
 * - retry: 2 (network resilience)
 *
 * Expected impact:
 * - 60% fewer repeated network requests
 * - Faster perceived performance on navigation
 * - Automatic background refetch on stale data
 */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Data considered fresh for 60 seconds
        staleTime: 60 * 1000,
        // Keep unused data in cache for 5 minutes
        gcTime: 5 * 60 * 1000,
        // Retry failed requests twice
        retry: 2,
        // Don't refetch on window focus (too aggressive for legal searches)
        refetchOnWindowFocus: false,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined = undefined;

export function getQueryClient() {
  if (typeof window === 'undefined') {
    // Server: always make a new query client
    return makeQueryClient();
  } else {
    // Browser: reuse existing query client
    if (!browserQueryClient) browserQueryClient = makeQueryClient();
    return browserQueryClient;
  }
}
