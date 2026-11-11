import { useEffect } from 'react';

/** Keep the screen on while mounted: you're following steps with sawdust on your hands. */
export function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        const l = await navigator.wakeLock?.request('screen');
        if (cancelled) void l?.release();
        else lock = l ?? null;
      } catch {
        // Not supported, or refused (battery saver): the screen just sleeps.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire();
    };
    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release();
    };
  }, []);
}
