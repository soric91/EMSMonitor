import { useEffect, useState } from 'react';
import { formatInTimeZone } from 'date-fns-tz';

const TIME_ZONE = 'America/Bogota';

export function useLocalClock(formatStr = 'EEE d MMM, HH:mm:ss'): string {
  const [formatted, setFormatted] = useState(() => formatInTimeZone(new Date(), TIME_ZONE, formatStr));

  useEffect(() => {
    const id = setInterval(() => {
      setFormatted(formatInTimeZone(new Date(), TIME_ZONE, formatStr));
    }, 1000);
    return () => clearInterval(id);
  }, [formatStr]);

  return formatted;
}
