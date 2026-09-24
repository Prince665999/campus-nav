// React hook that yields a compass heading.
//
// Uses the magnetometer when available. When it isn't, falls back to
// the GPS direction of travel while the student is moving. The
// heading is null until one of those sources produces a value.

import { useEffect, useRef, useState } from 'react';

import { hasMagnetometer, headingFromMovement, stop, watch } from '@/services/compass';

export function useCompass({ position } = {}) {
  const [heading, setHeading] = useState(null);
  const [source, setSource] = useState(null); // 'magnetometer' | 'gps' | null
  const [available, setAvailable] = useState(true);

  // Track the previous position so GPS-derived heading can be
  // computed from the movement between two fixes.
  const prevPositionRef = useRef(null);

  // Magnetometer subscription.
  useEffect(() => {
    let stopFn = null;
    let cancelled = false;

    hasMagnetometer().then((has) => {
      if (cancelled || !has) {
        setAvailable(false);
        return;
      }
      watch(
        (h) => {
          if (cancelled) return;
          if (h !== null) {
            setHeading(h);
            setSource('magnetometer');
          }
        },
        () => {
          if (!cancelled) setAvailable(false);
        }
      ).then((fn) => {
        stopFn = fn;
      });
    });

    return () => {
      cancelled = true;
      if (stopFn) stopFn();
      else stop();
    };
  }, []);

  // GPS-derived heading, when position updates are available and no
  // magnetometer reading has arrived.
  useEffect(() => {
    if (!position) return;

    const prev = prevPositionRef.current;
    prevPositionRef.current = { lat: position.lat, lon: position.lon };

    if (source === 'magnetometer') return;
    if (!prev) return;

    const derived = headingFromMovement(prev, position);
    if (derived !== null) {
      setHeading(derived);
      setSource('gps');
    }
  }, [position, source]);

  return {
    heading,
    source,
    available,
    isFromMagnetometer: source === 'magnetometer',
  };
}