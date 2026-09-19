// Debounce a value. Returns the value only after it hasn't changed
// for `delay` milliseconds.
//
// Usage:
//   const debounced = useDebounce(input, 300);
//
// The search bar uses this so we don't hit the API on every keystroke.

import { useEffect, useState } from 'react';

export function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}