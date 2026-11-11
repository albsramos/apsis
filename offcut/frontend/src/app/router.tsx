import { createBrowserRouter } from 'react-router';
import { InstructionsPage } from '@/pages/InstructionsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { ProjectPage } from '@/pages/ProjectPage';
import { ProjectsPage } from '@/pages/ProjectsPage';
import { SettingsPage } from '@/pages/SettingsPage';

export const router = createBrowserRouter([
  { path: '/', element: <ProjectsPage /> },
  { path: '/projects/:id', element: <ProjectPage /> },
  { path: '/projects/:id/steps/:step', element: <InstructionsPage /> },
  { path: '/settings', element: <SettingsPage /> },
  { path: '*', element: <NotFoundPage /> },
]);
