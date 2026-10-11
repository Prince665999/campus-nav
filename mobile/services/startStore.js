// The shared starting point.
//
// "Where will the next route start from?" has exactly one answer at
// a time, and it belongs to the session, not to any one screen.
// Home sets it. The place-detail screen reads it. Arrival clears it.
//
// Before this store existed, each screen called useStartingPoint()
// and got its own copy of `start` in local state. The Home screen's
// choice was invisible to place-detail, so the chip appeared to
// reset. This module is the shared answer.
//
// Rules:
//   - The store is not persisted. Every cold app start begins with
//     start === null, which is exactly the behaviour we want: the
//     student's last choice doesn't survive closing the app.
//   - start is cleared the moment a route is committed, and again
//     when the arrival screen mounts. See clearStart's callers.
//   - No TTL. If a clear is missed, the start is stale — but the
//     two clear points above (commit + arrival) mean a miss is
//     unlikely. Adding a TTL would hide bugs, not fix them.

import { useSyncExternalStore } from 'react';

let current = null;
const listeners = new Set();

function emit() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // A listener throwing must not prevent the others from running.
    }
  });
}

export function getStart() {
  return current;
}

export function setStart(value) {
  // Normalise: null and undefined both mean "no start".
  current = value || null;
  emit();
}

export function clearStart() {
  if (current === null) return;
  current = null;
  emit();
}

export function subscribeStart(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * React hook. Returns the current start value and re-renders the
 * component whenever the store changes.
 */
export function useStart() {
  return useSyncExternalStore(subscribeStart, getStart, getStart);
}