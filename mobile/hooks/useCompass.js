// React hook that subscribes to the compass and exposes the current
// heading.
//
// Usage:
//   const { heading, available } = useCompass();
//   // heading is degrees 0..360, or null before the first reading
//   // available is false if the device has no magnetometer

import { useEffect, useState } from 'react';

import { stop, watch } from '@/services/compass';

export function useCompass() {
  const [heading, setHeading] = useState(null);
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    let stopFn = null;
    let cancelled = false;

    watch(
      (h) => {
        if (!cancelled) setHeading(h);
      },
      () => {
        if (!cancelled) setAvailable(false);
      }
    ).then((stopSubscription) => {
      stopFn = stopSubscription;
    });

    return () => {
      cancelled = true;
      if (stopFn) stopFn();
      else stop();
    };
  }, []);

  return { heading, available };
}