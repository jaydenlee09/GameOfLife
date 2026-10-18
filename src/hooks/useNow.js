import { useEffect, useState } from 'react';

// Re-renders every `ms` so countdowns and time-of-day logic stay current.
export function useNow(ms) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
