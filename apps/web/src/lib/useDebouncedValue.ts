'use client';

import { useEffect, useState } from 'react';

/**
 * Delays propagation of rapidly changing values (typically search boxes) so
 * typing does not fire one API request per keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
