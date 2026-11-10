/**
 * How often each kind of data is re-read. Polling stands in for a push channel: when the backend offers one
 * (SSE or WebSocket), write its messages into the same React Query cache keys and drop these intervals.
 */
export const LIVE = { refetchInterval: 1000 } as const
export const SLOW = { refetchInterval: 2000 } as const
export const STATIC = { staleTime: Infinity } as const
