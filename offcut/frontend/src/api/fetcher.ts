// Every generated hook calls the API through this function.
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// The standalone build (VITE_STANDALONE=1) has no server: an in-browser copy
// of the API answers instead. In the normal build this branch is removed.
const standalone = import.meta.env.VITE_STANDALONE === '1';

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  if (standalone) {
    const { mockFetch } = await import('@/standalone');
    return mockFetch<T>(url, init);
  }
  const res = await fetch(url.startsWith('/api') ? url : `/api${url}`, init);
  if (!res.ok) {
    let message = `The server answered ${res.status}.`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // not JSON; keep the generic message
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// orval types every hook's error with this: whatever the API declares, what
// reaches the component is an ApiError with a readable message.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type ErrorType<_Declared> = ApiError;

// Where a photo's image is served. The standalone build keeps photos in the
// browser and swaps this for one that returns their data URLs.
let photoUrlFor = (id: string) => `/api/photos/${id}`;

export function photoUrl(id: string): string {
  return photoUrlFor(id);
}

export function setPhotoUrl(fn: (id: string) => string) {
  photoUrlFor = fn;
}
