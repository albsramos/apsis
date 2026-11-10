import { defineConfig } from 'orval'

/**
 * Generates the typed React Query hooks in src/api/generated from the API contract.
 * Today the contract is the file in this repo. When the backend exists, set LINEWATCH_SWAGGER to its
 * Swagger URL (or change `target`) and run `npm run api:sync`.
 */
export default defineConfig({
  linewatch: {
    input: { target: process.env.LINEWATCH_SWAGGER ?? './api/openapi.yaml' },
    output: {
      mode: 'tags-split',
      target: './src/api/generated',
      schemas: './src/api/generated/model',
      client: 'react-query',
      baseUrl: '/api',
      clean: true,
      override: {
        mutator: { path: './src/api/http.ts', name: 'http' },
        // Hooks return the body itself; http() throws ApiRequestError on a non-2xx.
        fetch: { includeHttpResponseReturnType: false },
      },
    },
  },
})
