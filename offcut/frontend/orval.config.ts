import { defineConfig } from 'orval';

// The backend's swag annotations are the source of truth. `make api` (or
// `npm run api` after `swag init`) regenerates the hooks from them.
export default defineConfig({
  offcut: {
    input: { target: '../backend/docs/swagger.json' },
    output: {
      target: 'src/api/generated/endpoints.ts',
      schemas: 'src/api/generated/model',
      client: 'react-query',
      httpClient: 'fetch',
      mode: 'tags-split',
      clean: true,
      override: {
        mutator: { path: 'src/api/fetcher.ts', name: 'apiFetch' },
        query: { signal: true },
        // Hooks return the response body; errors throw ApiError (fetcher.ts).
        fetch: { includeHttpResponseReturnType: false },
      },
    },
  },
});
