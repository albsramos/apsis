import { createBrowserRouter, createMemoryRouter, RouterProvider } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'

const routes = [
  { path: '/', element: <AppShell /> },
  { path: '/cluster/:id', element: <AppShell /> },
  { path: '*', element: <AppShell /> },
]

/**
 * The normal build routes on real paths (/cluster/ko-5). The artifact build (`npm run build:artifact`) is served
 * where only a plain `#name` survives in a link, and the GitHub Pages build (`npm run build:pages`) is a static host
 * with no server-side fallback, so both keep routes in memory and mirror the selection to `#ko-5`, reading it back
 * on load.
 */
const hashRoutes = import.meta.env.MODE === 'artifact' || import.meta.env.MODE === 'pages'

function makeRouter() {
  if (!hashRoutes) return createBrowserRouter(routes)
  const fromHash = () => {
    const id = window.location.hash.slice(1)
    return /^ko-\d+$/.test(id) ? `/cluster/${id}` : '/'
  }
  const router = createMemoryRouter(routes, { initialEntries: [fromHash()] })
  router.subscribe((state) => {
    const id = state.location.pathname.match(/^\/cluster\/(ko-\d+)$/)?.[1]
    const hash = id ? `#${id}` : ''
    if (window.location.hash !== hash) history.replaceState(null, '', hash || window.location.pathname + window.location.search)
  })
  window.addEventListener('hashchange', () => {
    const to = fromHash()
    if (router.state.location.pathname !== to) router.navigate(to)
  })
  return router
}

const router = makeRouter()

export function App() {
  return <RouterProvider router={router} />
}
