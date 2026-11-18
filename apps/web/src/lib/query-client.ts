/**
 * GEOVENTRA — react-query client factory.
 *
 * A single factory keeps the query defaults in one place so the dashboard, the
 * engine fleet view and the live diagnostics page all behave identically.
 */

import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api';

/** Create a query client with the shared Geoventra defaults. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchInterval: 30_000,
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        refetchOnMount: 'always',
        retry: (failureCount, error) => {
          if (error instanceof ApiError) {
            // Never retry client errors; only transient server failures.
            if (error.status >= 400 && error.status < 500) return false;
            return failureCount < 2;
          }
          return failureCount < 2;
        },
      },
      mutations: {
        retry: false,
      },
    },
  });
}
