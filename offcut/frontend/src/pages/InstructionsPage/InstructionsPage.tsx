import { ArrowLeft, ArrowRight, Check, LayoutGrid, Printer, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import type { Spec } from '@/api';
import { IsoDrawing } from '@/components/drawing';
import { Button, Callout, Dialog, IconButton, Spinner } from '@/components/ui';
import { labelParts, stepScene, type Labels } from '@/lib/drawing';
import { useProject, useWakeLock } from '@/lib/hooks';
import { HardwareGlyph } from './HardwareGlyph';
import styles from './InstructionsPage.module.css';

export function InstructionsPage() {
  const { id = '', step = '1' } = useParams();
  const [search] = useSearchParams();
  const project = useProject(id);
  useWakeLock();

  if (project.isPending) return <Spinner label="Loading the instructions" />;
  if (project.isError || !project.data.spec) {
    return (
      <div className={styles.page}>
        <Callout tone="danger" title="No instructions yet">
          This piece has no plans yet. <Link to={`/projects/${id}`}>Back to the project</Link>
        </Callout>
      </div>
    );
  }
  const spec = project.data.spec.spec;
  if (search.get('print') === '1') return <PrintAll spec={spec} name={project.data.name} />;
  return <StepViewer projectId={id} name={project.data.name} spec={spec} index={Math.max(0, Number(step) - 1)} />;
}

function StepViewer({ projectId, name, spec, index }: { projectId: string; name: string; spec: Spec; index: number }) {
  const navigate = useNavigate();
  const [allOpen, setAllOpen] = useState(false);
  const labels = useMemo(() => labelParts(spec), [spec]);
  const total = spec.steps.length;
  const done = index >= total;
  // The step we're heading to. Two quick taps both run before the page
  // re-renders, so each moves on from the last target, not from the render.
  const target = useRef(index);
  useEffect(() => {
    target.current = index;
  }, [index]);
  const go = (i: number) => {
    target.current = Math.min(Math.max(i, 0), total);
    navigate(`/projects/${projectId}/steps/${target.current + 1}`, { replace: true });
  };
  const move = (delta: number) => go(target.current + delta);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'ArrowRight') move(1);
      if (e.key === 'ArrowLeft') move(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Swipe left or right on the drawing to change steps.
  const start = useRef<{ x: number; y: number } | null>(null);
  const swipe = {
    onPointerDown: (e: React.PointerEvent) => (start.current = { x: e.clientX, y: e.clientY }),
    onPointerUp: (e: React.PointerEvent) => {
      const s = start.current;
      start.current = null;
      if (!s) return;
      const dx = e.clientX - s.x;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(e.clientY - s.y) * 1.5) move(dx < 0 ? 1 : -1);
    },
  };

  return (
    <div className={styles.viewer}>
      <header className={styles.header}>
        <IconButton label="Close instructions" icon={<X size={22} aria-hidden="true" />} onClick={() => navigate(`/projects/${projectId}`)} />
        <div className={styles.headerTitle}>{name}</div>
        <IconButton label="All steps" icon={<LayoutGrid size={22} aria-hidden="true" />} onClick={() => setAllOpen(true)} />
      </header>
      <nav className={styles.progress} aria-label={`Step ${Math.min(index + 1, total)} of ${total}`}>
        {spec.steps.map((s, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Step ${i + 1}: ${s.title}`}
            aria-current={i === index ? 'step' : undefined}
            className={[styles.segment, i < index && styles.segmentDone, i === index && styles.segmentNow].filter(Boolean).join(' ')}
            onClick={() => go(i)}
          />
        ))}
      </nav>

      {done ? (
        <Finished spec={spec} labels={labels} projectId={projectId} onBack={() => go(total - 1)} />
      ) : (
        <Step spec={spec} labels={labels} index={index} swipe={swipe} />
      )}

      {!done && (
        <footer className={styles.footer}>
          <Button aria-label="Previous step" className={styles.prev} onClick={() => move(-1)} disabled={index === 0}>
            <ArrowLeft size={22} aria-hidden="true" />
          </Button>
          <Button variant="primary" size="lg" className={styles.next} onClick={() => move(1)}>
            {index + 1 === total ? 'Done' : 'Next'}
            {index + 1 === total ? <Check size={20} aria-hidden="true" /> : <ArrowRight size={20} aria-hidden="true" />}
          </Button>
        </footer>
      )}

      <Dialog open={allOpen} onOpenChange={setAllOpen} title="All steps" variant="sheet">
        <ol className={styles.allSteps}>
          {spec.steps.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                className={[styles.allStep, i === index && styles.allStepNow].filter(Boolean).join(' ')}
                onClick={() => {
                  setAllOpen(false);
                  go(i);
                }}
              >
                <span className={styles.allNum}>{i + 1}</span>
                <span>{s.title}</span>
              </button>
            </li>
          ))}
        </ol>
        <Button icon={<Printer size={16} aria-hidden="true" />} fullWidth onClick={() => window.open(`/projects/${projectId}/steps/1?print=1`, '_blank')}>
          Print all steps
        </Button>
      </Dialog>
    </div>
  );
}

interface Swipe {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
}

function Step({ spec, labels, index, swipe }: { spec: Spec; labels: Labels; index: number; swipe?: Swipe }) {
  const step = spec.steps[index]!;
  const scene = stepScene(spec, index);
  const letters = new Map([...labels.byPart].map(([id, g]) => [id, g.letter]));
  return (
    <div className={styles.step}>
      <div className={styles.say}>
        <div className={styles.number}>{index + 1}</div>
        <div>
          <div className={styles.stepOf}>
            STEP {index + 1} OF {spec.steps.length}
          </div>
          <p className={styles.text}>{step.text}</p>
        </div>
      </div>
      <div className={styles.drawing} {...swipe}>
        <IsoDrawing
          bold
          items={scene.items}
          highlight={scene.added}
          letters={letters}
          callouts={scene.added}
          arrows={scene.arrows}
          label={`Step ${index + 1}: ${step.title}. ${step.text}`}
        />
      </div>
      <YouNeed spec={spec} labels={labels} index={index} />
    </div>
  );
}

function YouNeed({ spec, labels, index }: { spec: Spec; labels: Labels; index: number }) {
  const step = spec.steps[index]!;
  const byLetter = new Map<string, { letter: string; name: string; n: number }>();
  for (const id of step.parts) {
    const g = labels.byPart.get(id);
    if (!g) continue;
    const e = byLetter.get(g.letter) ?? { letter: g.letter, name: g.name, n: 0 };
    e.n++;
    byLetter.set(g.letter, e);
  }
  const hw = new Map(spec.hardware.map((h) => [h.id, h]));
  if (byLetter.size === 0 && step.hardware.length === 0) return null;
  return (
    <aside className={styles.need} aria-label="You need">
      <div className={styles.needLabel}>YOU NEED</div>
      <ul className={styles.needList}>
        {[...byLetter.values()].map((e) => (
          <li key={e.letter}>
            <span className={styles.needQty}>{e.n}×</span>
            <span className={styles.needLetter}>{e.letter}</span>
            <span className={styles.needName}>{e.name}</span>
          </li>
        ))}
        {step.hardware.map((u) => {
          const h = hw.get(u.id);
          return (
            <li key={u.id}>
              <span className={styles.needQty}>{u.quantity}×</span>
              <HardwareGlyph name={h?.name ?? u.id} />
              <span className={styles.needName}>{h?.name ?? u.id}</span>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

function Finished({ spec, labels, projectId, onBack }: { spec: Spec; labels: Labels; projectId: string; onBack: () => void }) {
  return (
    <div className={styles.finished}>
      <div className={styles.drawing}>
        <IsoDrawing bold items={spec.parts.map((part) => ({ part }))} label={`The finished ${spec.name}.`} letters={new Map()} />
      </div>
      <h1 className={styles.finishedTitle}>That's it.</h1>
      <p className={styles.text}>
        {spec.parts.length} boards, {labels.groups.length} different. Sand the edges and finish it however you like.
      </p>
      <div className={styles.finishedActions}>
        <Button onClick={onBack}>Back to the last step</Button>
        <Button asChild variant="primary">
          <Link to={`/projects/${projectId}`}>Back to the drawings</Link>
        </Button>
      </div>
    </div>
  );
}

function PrintAll({ spec, name }: { spec: Spec; name: string }) {
  const labels = useMemo(() => labelParts(spec), [spec]);
  useEffect(() => {
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className={styles.print}>
      <h1 className={styles.printTitle}>{name}</h1>
      {spec.steps.map((_, i) => (
        <section key={i} className={styles.printPage}>
          <Step spec={spec} labels={labels} index={i} />
        </section>
      ))}
    </div>
  );
}
