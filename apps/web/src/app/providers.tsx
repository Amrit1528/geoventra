/**
 * GEOVENTRA — client providers.
 *
 * Mounts the react-query client. Authentication is persisted automatically by the zustand
 * store on first render; nothing else needs provider setup here.
 */

'use client';

import { useState, type ReactNode, type ReactElement } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '@/lib/query-client';

export function Providers({ children }: { children: ReactNode }): ReactElement {
  const [client] = useState(() => createQueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
