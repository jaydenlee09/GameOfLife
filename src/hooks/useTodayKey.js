import { useEffect, useState } from 'react';
import { getLocalDateKey } from '../utils/scoreUtils';

// Today's YYYY-MM-DD. Checks every minute and on returning to the tab, but only
// re-renders when the date actually rolls over (same string = no update).
export default function useTodayKey() {
  const [key, setKey] = useState(() => getLocalDateKey(0));
  useEffect(() => {
    const tick = () => setKey(getLocalDateKey(0));
    const id = setInterval(tick, 60000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);
  return key;
}
