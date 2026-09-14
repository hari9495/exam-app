import { useEffect, useState } from 'react';

// Returns `value` delayed by `delayMs` — used to debounce a picker's typed query before it drives a
// server-side search useQuery, so we fetch once the user pauses rather than on every keystroke.
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}
