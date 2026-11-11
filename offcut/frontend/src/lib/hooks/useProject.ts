import { getGetProjectQueryKey, useGetProject, type Project } from '@/api';

/** A project, polled every second while the AI is working on it. */
export function useProject(id: string) {
  return useGetProject(id, {
    query: {
      refetchInterval: (q) => ((q.state.data as Project | undefined)?.status === 'analyzing' ? 1000 : false),
    },
  });
}

export { getGetProjectQueryKey };
