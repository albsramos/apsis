import { useQueryClient } from '@tanstack/react-query';
import { Camera, ImagePlus, RotateCcw, Ruler, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  getGetProjectQueryKey,
  getListProjectsQueryKey,
  useAnalyzeProject,
  useDeletePhoto,
  useUploadPhoto,
  type AnalyzeRequest,
  type Project,
} from '@/api';
import { Button, Callout, Field, FileButton, IconButton, Input, Progress, Select, Textarea } from '@/components/ui';
import { downscale } from '@/lib/image';
import styles from './CapturePanel.module.css';

const VIEWS = ['Front', 'Side', 'Back', 'Top', 'Inside', 'Detail'];
const REFERENCES = ['Overall width', 'Overall height', 'Overall depth', 'Top width', 'Top depth'];

export interface CapturePanelProps {
  project: Project;
}

/**
 * Everything before the drawings, and everything that sends the AI back to
 * work: photos, the reference measurement, answering what it asked, retrying.
 */
export function CapturePanel({ project }: CapturePanelProps) {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: getGetProjectQueryKey(project.id) });
    void qc.invalidateQueries({ queryKey: getListProjectsQueryKey() });
  };
  const upload = useUploadPhoto({ mutation: { onSuccess: refresh } });
  const remove = useDeletePhoto({ mutation: { onSuccess: refresh } });
  const analyze = useAnalyzeProject({ mutation: { onSuccess: refresh } });

  const [uploading, setUploading] = useState(0);
  const addPhotos = async (files: File[], view: string) => {
    setUploading((n) => n + files.length);
    for (const f of files) {
      try {
        const blob = await downscale(f);
        await upload.mutateAsync({ id: project.id, data: { file: blob, view } });
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const first = project.conversation.length === 0;
  const unsent = project.photos.filter((p) => !p.sent);
  const busy = project.status === 'analyzing';
  const run = (body: AnalyzeRequest) => analyze.mutate({ id: project.id, data: body });

  return (
    <div className={styles.panel}>
      {busy && <Analyzing since={project.updatedAt} />}

      {project.status === 'failed' && (
        <Callout
          tone="danger"
          title="The analysis stopped"
          action={
            <Button icon={<RotateCcw size={16} aria-hidden="true" />} onClick={() => run({})} disabled={analyze.isPending}>
              Try again
            </Button>
          }
        >
          {project.error}
        </Callout>
      )}

      {project.status === 'needs_input' && project.pending && (
        <PendingRequest project={project} onAddPhotos={addPhotos} onContinue={run} uploading={uploading > 0} disabled={analyze.isPending} />
      )}

      <section className={styles.section} aria-labelledby="photos-heading">
        <div className={styles.sectionHead}>
          <h2 id="photos-heading" className={styles.heading}>
            Photos
          </h2>
          <span className={styles.count}>{project.photos.length}</span>
        </div>
        <PhotoGrid project={project} onDelete={(id) => remove.mutate({ id })} />
        <AddPhoto key={project.photos.length} index={project.photos.length} onAdd={addPhotos} uploading={uploading > 0} disabled={busy} />
        {upload.isError && <Callout tone="danger">{upload.error.message}</Callout>}
        {remove.isError && <Callout tone="danger">{remove.error.message}</Callout>}
      </section>

      {first && !busy && (
        <FirstRun
          project={project}
          disabled={analyze.isPending || uploading > 0 || project.photos.length === 0}
          onStart={(reference, notes) => run({ reference, notes })}
        />
      )}

      {!first && !busy && project.status !== 'needs_input' && project.status !== 'failed' && (
        <Rerun unsent={unsent.length} disabled={analyze.isPending || uploading > 0} onRun={(notes) => run({ notes })} />
      )}

      {analyze.isError && <Callout tone="danger">{analyze.error.message}</Callout>}

      {project.conversation.length > 0 && (
        <details className={styles.log}>
          <summary>What was said to the AI</summary>
          <ol className={styles.logList}>
            {project.conversation.map((c, i) => (
              <li key={i} className={c.role === 'assistant' ? styles.fromAI : styles.fromYou}>
                <span className={styles.who}>{c.role === 'assistant' ? 'AI' : 'You'}</span>
                <span className={styles.said}>{c.text}</span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}

function Analyzing({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const seconds = Math.max(0, Math.round((now - new Date(since).getTime()) / 1000));
  return (
    <div className={styles.analyzing} role="status">
      <div className={styles.analyzingHead}>
        <Sparkles size={18} aria-hidden="true" />
        <span className={styles.analyzingTitle}>Drawing up the plans</span>
        <span className={styles.elapsed}>{seconds}s</span>
      </div>
      <Progress label="Analysing the photos" />
      <p className={styles.muted}>
        Reading proportions, choosing joints and checking every part adds up. This takes a minute or two; you can
        leave this page.
      </p>
    </div>
  );
}

function PhotoGrid({ project, onDelete }: { project: Project; onDelete: (id: string) => void }) {
  if (project.photos.length === 0) {
    return <p className={styles.muted}>Start with a photo straight on from the front, with the whole piece in frame.</p>;
  }
  return (
    <ul className={styles.photos}>
      {project.photos.map((ph) => (
        <li key={ph.id} className={styles.photo}>
          <img src={ph.url} alt={ph.view || 'Photo'} />
          <span className={styles.photoLabel}>{ph.view || 'Photo'}</span>
          {!ph.sent && (
            <IconButton className={styles.photoDelete} label={`Remove ${ph.view || 'photo'}`} icon={<Trash2 size={16} aria-hidden="true" />} onClick={() => onDelete(ph.id)} />
          )}
        </li>
      ))}
    </ul>
  );
}

function AddPhoto({ index, onAdd, uploading, disabled }: { index: number; onAdd: (f: File[], view: string) => void; uploading: boolean; disabled: boolean }) {
  const [view, setView] = useState(VIEWS[Math.min(index, 2)] ?? 'Front');
  return (
    <div className={styles.addPhoto}>
      <Field label="This photo shows">
        {(id) => <Select id={id} value={view} onChange={(e) => setView(e.target.value)} options={VIEWS.map((v) => ({ value: v, label: v }))} />}
      </Field>
      <div className={styles.row}>
        <FileButton camera variant="primary" icon={<Camera size={18} aria-hidden="true" />} onFiles={(f) => onAdd(f, view)} disabled={disabled || uploading}>
          {uploading ? 'Uploading…' : 'Take photo'}
        </FileButton>
        <FileButton multiple icon={<ImagePlus size={18} aria-hidden="true" />} onFiles={(f) => onAdd(f, view)} disabled={disabled || uploading}>
          Upload
        </FileButton>
      </div>
    </div>
  );
}

function FirstRun({ project, disabled, onStart }: { project: Project; disabled: boolean; onStart: (r: { label: string; mm: number }, notes: string) => void }) {
  const [label, setLabel] = useState(project.reference?.label ?? REFERENCES[0]!);
  const [value, setValue] = useState(project.reference ? String(project.reference.mm) : '');
  const [notes, setNotes] = useState(project.notes);
  const n = Number(value.replace(',', '.'));
  const valid = Number.isFinite(n) && n > 0;
  return (
    <section className={styles.section} aria-labelledby="ref-heading">
      <div className={styles.sectionHead}>
        <Ruler size={18} aria-hidden="true" />
        <h2 id="ref-heading" className={styles.heading}>
          One real measurement
        </h2>
      </div>
      <p className={styles.muted}>A photo has no scale. Measure one thing with a tape, and every other size is worked out from it.</p>
      <div className={styles.refRow}>
        <Field label="What you measured">
          {(id) => <Select id={id} value={label} onChange={(e) => setLabel(e.target.value)} options={REFERENCES.map((r) => ({ value: r, label: r }))} />}
        </Field>
        <Field label="Length">
          {(id) => <Input id={id} inputMode="decimal" mono suffix="mm" value={value} onChange={(e) => setValue(e.target.value)} placeholder="450" />}
        </Field>
      </div>
      <Field label="Anything else? (optional)" hint="Materials you'd like, what's inside, what you'd change.">
        {(id) => <Textarea id={id} value={notes} onChange={(e) => setNotes(e.target.value)} />}
      </Field>
      <Button variant="primary" size="lg" fullWidth disabled={disabled || !valid} onClick={() => onStart({ label, mm: n }, notes)}>
        Draw up the plans
      </Button>
    </section>
  );
}

function Rerun({ unsent, disabled, onRun }: { unsent: number; disabled: boolean; onRun: (notes: string) => void }) {
  const [notes, setNotes] = useState('');
  return (
    <section className={styles.section} aria-labelledby="rerun-heading">
      <h2 id="rerun-heading" className={styles.heading}>
        Ask the AI to look again
      </h2>
      <Field label="What should change?" hint={unsent > 0 ? `${unsent} new photo(s) will be sent too.` : 'Add photos above, or describe what is wrong.'}>
        {(id) => <Textarea id={id} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="There are two drawers, not one." />}
      </Field>
      <Button variant="primary" disabled={disabled || (unsent === 0 && notes.trim() === '')} onClick={() => onRun(notes)}>
        Re-analyse
      </Button>
    </section>
  );
}

function PendingRequest({
  project,
  onAddPhotos,
  onContinue,
  uploading,
  disabled,
}: {
  project: Project;
  onAddPhotos: (f: File[], view: string) => void;
  onContinue: (body: AnalyzeRequest) => void;
  uploading: boolean;
  disabled: boolean;
}) {
  const pending = project.pending!;
  const [answers, setAnswers] = useState<string[]>(() => pending.questions.map(() => ''));
  const added = new Set(project.photos.filter((p) => !p.sent).map((p) => p.view));
  const ready = pending.shots.some((s) => added.has(s.view)) || answers.some((a) => a.trim() !== '');
  return (
    <section className={styles.pending} aria-labelledby="pending-heading">
      <h2 id="pending-heading" className={styles.heading}>
        The AI needs a little more
      </h2>
      {pending.message && <p>{pending.message}</p>}
      {pending.shots.map((s) => (
        <div key={s.view} className={styles.shot}>
          <div className={styles.shotText}>
            <span className={styles.shotTitle}>{s.view}</span>
            <span className={styles.muted}>{s.reason}</span>
          </div>
          {added.has(s.view) ? (
            <span className={styles.done}>Added</span>
          ) : (
            <div className={styles.row}>
              <FileButton camera variant="primary" icon={<Camera size={16} aria-hidden="true" />} onFiles={(f) => onAddPhotos(f, s.view)} disabled={uploading}>
                Take photo
              </FileButton>
              <FileButton onFiles={(f) => onAddPhotos(f, s.view)} disabled={uploading}>
                Upload
              </FileButton>
            </div>
          )}
        </div>
      ))}
      {pending.questions.map((q, i) => (
        <Field key={q.question} label={q.question} hint={q.reason}>
          {(id) => (
            <Input
              id={id}
              value={answers[i] ?? ''}
              onChange={(e) => setAnswers((a) => a.map((x, j) => (j === i ? e.target.value : x)))}
            />
          )}
        </Field>
      ))}
      <div className={styles.pendingActions}>
        <Button variant="primary" size="lg" fullWidth disabled={disabled || uploading || !ready} onClick={() => onContinue({ answers })}>
          Continue
        </Button>
        <Button variant="ghost" fullWidth disabled={disabled || uploading} onClick={() => onContinue({ skip: true })}>
          Can't do this? Continue with assumptions
        </Button>
      </div>
    </section>
  );
}
