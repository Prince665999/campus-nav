// Checks the student's position against the Wi-Fi spots near them,
// and exposes the closest one for the banner to display.

import { useEffect, useRef, useState } from 'react';

import { getNearbyWifi } from '@/services/api';

// How often to re-check, in milliseconds. The student is walking, so
// 5 seconds is responsive without being wasteful.
const CHECK_INTERVAL_MS = 5000;

// Don't re-show a banner for the same spot within this many seconds
// of dismissing it. Keeps a banner the student already dismissed from
// popping straight back up.
const REAPPEAR_COOLDOWN_S = 300;

export function useNearbyWifi({ position, enabled }) {
  const [spot, setSpot] = useState(null);

  // Tracks dismissed spots so they don't immediately reappear.
  const dismissedRef = useRef(new Map());

  useEffect(() => {
    if (!enabled) {
      setSpot(null);
      return;
    }
    if (!position) return;

    let cancelled = false;

    async function check() {
      try {
        const result = await getNearbyWifi({
          lat: position.lat,
          lon: position.lon,
          r: 25,
        });
        if (cancelled) return;

        const spots = result.spots || [];
        if (spots.length === 0) {
          setSpot(null);
          return;
        }

        // Pick the closest that hasn't been dismissed recently.
        const now = Date.now() / 1000;
        const visible = spots.find((s) => {
          const dismissedAt = dismissedRef.current.get(s.place_id);
          if (!dismissedAt) return true;
          return now - dismissedAt > REAPPEAR_COOLDOWN_S;
        });

        setSpot(visible || null);
      } catch {
        if (!cancelled) setSpot(null);
      }
    }

    check();
    const id = setInterval(check, CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [position, enabled]);

  function dismiss() {
    if (spot) {
      dismissedRef.current.set(spot.place_id, Date.now() / 1000);
      setSpot(null);
    }
  }

  return { spot, dismiss };
}