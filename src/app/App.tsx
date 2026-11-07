import { createBrowserRouter, RouterProvider } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'

const router = createBrowserRouter([
  { path: '/', element: <AppShell /> },
  { path: '/cluster/:id', element: <AppShell /> },
  { path: '*', element: <AppShell /> },
])

export function App() {
  return <RouterProvider router={router} />
}
