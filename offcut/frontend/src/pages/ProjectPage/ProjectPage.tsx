import { useQueryClient } from '@tanstack/react-query';
import { BookOpen, Camera, Printer, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { getListProjectsQueryKey, useDeleteProject } from '@/api';
import { CapturePanel } from '@/components/capture/CapturePanel';
import { Page, TopBar } from '@/components/layout';
import { StatusBadge } from '@/components/project/StatusBadge';
import { Button, Callout, Dialog, IconButton, Spinner } from '@/components/ui';
import { Workspace } from '@/components/workspace/Workspace';
import { useProject } from '@/lib/hooks';
import styles from './ProjectPage.module.css';

export function ProjectPage() {
  const { id = '' } = useParams();
  const project = useProject(id);
  const [captureOpen, setCaptureOpen] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const del = useDeleteProject({
    mutation: {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        navigate('/');
      },
    },
  });

  if (project.isPending) {
    return (
      <Page bar={<TopBar />} width="narrow">
        <Spinner label="Loading the project" />
      </Page>
    );
  }
  if (project.isError) {
    return (
      <Page bar={<TopBar />} width="narrow">
        <Callout tone="danger" title="Couldn't open this project">
          {project.error.message} <Link to="/">Back to your pieces</Link>
        </Callout>
      </Page>
    );
  }

  const p = project.data;
  const remove = () => {
    if (window.confirm(`Delete “${p.name}”, its photos and its plans? This can't be undone.`)) del.mutate({ id: p.id });
  };
  const trail = (
    <>
      <span aria-hidden="true">/</span>
      <span className={styles.name}>{p.name}</span>
      <StatusBadge status={p.status} pendingCount={(p.pending?.shots.length ?? 0) + (p.pending?.questions.length ?? 0)} />
    </>
  );

  if (!p.spec) {
    return (
      <Page bar={<TopBar trail={trail} actions={<IconButton label="Delete this piece" icon={<Trash2 size={18} aria-hidden="true" />} onClick={remove} />} />} width="narrow">
        <CapturePanel project={p} />
      </Page>
    );
  }

  const actions = (
    <>
      <Button icon={<Camera size={16} aria-hidden="true" />} onClick={() => setCaptureOpen(true)}>
        Photos ({p.photos.length})
      </Button>
      <Button asChild variant="primary">
        <Link to={`/projects/${p.id}/steps/1`}>
          <BookOpen size={16} aria-hidden="true" />
          Instructions
        </Link>
      </Button>
      <IconButton label="Print the drawings" icon={<Printer size={18} aria-hidden="true" />} onClick={() => window.print()} />
    </>
  );

  return (
    <Page bar={<TopBar trail={trail} actions={actions} />} width="full">
      {p.status === 'analyzing' && (
        <div className={styles.banner}>
          <Callout tone="accent" icon={<Spinner size={16} label="Working" />} title="The AI is revising the plans">
            These drawings are the last version. They'll update when it's done.
          </Callout>
        </div>
      )}
      {(p.status === 'needs_input' || p.status === 'failed') && (
        <div className={styles.banner}>
          <Callout
            tone={p.status === 'failed' ? 'danger' : 'highlight'}
            title={p.status === 'failed' ? 'The last re-analysis stopped' : 'The AI needs a little more'}
            action={<Button onClick={() => setCaptureOpen(true)}>Open</Button>}
          >
            {p.status === 'failed' ? p.error : p.pending?.message}
          </Callout>
        </div>
      )}
      <Workspace key={p.spec.version} projectId={p.id} name={p.name} version={p.spec} />
      <Dialog open={captureOpen} onOpenChange={setCaptureOpen} variant="sheet" title="Photos and the AI">
        <div className={styles.sheet}>
          <CapturePanel project={p} />
          <div className={styles.danger}>
            <Button variant="danger" icon={<Trash2 size={16} aria-hidden="true" />} onClick={remove}>
              Delete this piece
            </Button>
          </div>
        </div>
      </Dialog>
    </Page>
  );
}
