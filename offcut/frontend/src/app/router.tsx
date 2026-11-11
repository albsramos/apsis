import { createBrowserRouter, createMemoryRouter } from 'react-router';
import { InstructionsPage } from '@/pages/InstructionsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { ProjectPage } from '@/pages/ProjectPage';
import { ProjectsPage } from '@/pages/ProjectsPage';
import { SettingsPage } from '@/pages/SettingsPage';

// The standalone build runs inside a page whose address it doesn't own, so it
// keeps the route in memory.
const createRouter = import.meta.env.VITE_STANDALONE === '1' ? createMemoryRouter : createBrowserRouter;

export const router = createRouter([
  { path: '/', element: <ProjectsPage /> },
  { path: '/projects/:id', element: <ProjectPage /> },
  { path: '/projects/:id/steps/:step', element: <InstructionsPage /> },
  { path: '/settings', element: <SettingsPage /> },
  { path: '*', element: <NotFoundPage /> },
]);
