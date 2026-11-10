import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import { useListFactories } from '@/api'
import { AppShell } from '@/components/layout/AppShell'
import { STATIC } from '@/lib/live'

/** `/` opens the first factory the user can see. */
function Home() {
  const first = useListFactories({ query: STATIC }).data?.[0]
  return first ? <Navigate to={`/${first.id}`} replace /> : null
}

/** The URL is the selection: /:factoryId, or /:factoryId/carrier/:carrierId; ?lens= is the lens. */
const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  { path: '/:factoryId', element: <AppShell /> },
  { path: '/:factoryId/carrier/:carrierId', element: <AppShell /> },
  { path: '*', element: <Navigate to="/" replace /> },
])

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
})

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}
