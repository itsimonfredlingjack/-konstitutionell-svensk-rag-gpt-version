'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/query-client';

/**
 * Client-side providers wrapper for React Query
 *
 * Why separate file?
 * - layout.tsx is a Server Component by default
 * - QueryClientProvider needs client-side React Context
 * - This pattern allows mixing server/client components
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
