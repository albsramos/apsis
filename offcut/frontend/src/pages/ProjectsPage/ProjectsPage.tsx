import { useQueryClient } from '@tanstack/react-query';
import { Box, Camera, Settings } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { getListProjectsQueryKey, photoUrl, useCreateProject, useListProjects, type ProjectSummary } from '@/api';
import { Page, TopBar } from '@/components/layout';
import { StatusBadge } from '@/components/project/StatusBadge';
import { Button, Callout, Dialog, Field, IconButton, Input, Spinner } from '@/components/ui';
import { mm, plural } from '@/lib/format';
import styles from './ProjectsPage.module.css';

export function ProjectsPage() {
  const projects = useListProjects();
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  return (
    <Page
      bar={
        <TopBar
          actions={
            <IconButton label="Settings" icon={<Settings size={20} aria-hidden="true" />} onClick={() => navigate('/settings')} />
          }
        />
      }
    >
      <div className={styles.header}>
        <h1 className={styles.title}>Your pieces</h1>
        <Button variant="primary" icon={<Camera size={18} aria-hidden="true" />} onClick={() => setCreating(true)}>
          Photograph a piece
        </Button>
      </div>

      {projects.isPending && <Spinner label="Loading projects" />}
      {projects.isError && <Callout tone="danger" title="Couldn't load your projects">{projects.error.message}</Callout>}
      {projects.data?.length === 0 && (
        <div className={styles.empty}>
          <Box size={40} aria-hidden="true" className={styles.emptyIcon} />
          <p className={styles.emptyTitle}>Start with a simple piece</p>
          <p className={styles.emptyText}>
            A bedside table, a shelf or a small cabinet. Take a photo from the front, measure one thing with a tape,
            and you'll get the parts, a cut list and step-by-step instructions.
          </p>
        </div>
      )}
      {projects.data && projects.data.length > 0 && (
        <ul className={styles.grid}>
          {projects.data.map((p) => (
            <li key={p.id}>
              <ProjectCard project={p} />
            </li>
          ))}
        </ul>
      )}

      <NewProjectDialog open={creating} onOpenChange={setCreating} />
    </Page>
  );
}

function ProjectCard({ project: p }: { project: ProjectSummary }) {
  const detail = p.overall
    ? `${mm(p.overall.width.value)} × ${mm(p.overall.height.value)} × ${mm(p.overall.depth.value)} · ${plural(p.partCount, 'board')}`
    : plural(p.photoCount, 'photo');
  return (
    <Link to={`/projects/${p.id}`} className={styles.card}>
      <span className={styles.thumb}>
        {p.coverPhotoId ? <img src={photoUrl(p.coverPhotoId)} alt="" loading="lazy" /> : <Box size={28} aria-hidden="true" />}
      </span>
      <span className={styles.cardBody}>
        <span className={styles.cardTitle}>{p.name}</span>
        <span className={styles.cardDetail}>{detail}</span>
        <span className={styles.cardStatus}>
          <StatusBadge status={p.status} pendingCount={p.pendingCount} />
        </span>
      </span>
    </Link>
  );
}

function NewProjectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [name, setName] = useState('');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const create = useCreateProject({
    mutation: {
      onSuccess: (p) => {
        void qc.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        onOpenChange(false);
        navigate(`/projects/${p.id}`);
      },
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate({ data: { name: name.trim() || 'Untitled piece' } });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="New piece">
      <form onSubmit={submit} className={styles.form}>
        <Field label="What is it?">
          {(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="Bedside table" autoFocus />}
        </Field>
        {create.isError && <Callout tone="danger">{create.error.message}</Callout>}
        <Button type="submit" variant="primary" size="lg" fullWidth disabled={create.isPending}>
          Continue to photos
        </Button>
      </form>
    </Dialog>
  );
}
