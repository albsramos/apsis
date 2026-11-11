import type { ReactNode } from 'react';
import type { Part, Spec } from '@/api';
import { Callout, Input } from '@/components/ui';
import { board, type Axis, type Labels } from '@/lib/drawing';
import { dims, mm } from '@/lib/format';
import { ConfidenceMark } from './ConfidenceMark';
import styles from './Inspector.module.css';

export interface InspectorProps {
  spec: Spec;
  labels: Labels;
  selected: string | null;
  onChange: (spec: Spec) => void;
}

const SIZE: { axis: Axis; label: string }[] = [
  { axis: 'x', label: 'Width' },
  { axis: 'y', label: 'Height' },
  { axis: 'z', label: 'Depth' },
];

const METHOD: Record<string, string> = {
  screw: 'screw',
  pocket_screw: 'pocket screw',
  dowel: 'dowel',
  glue: 'glue',
  groove: 'groove',
  cam_lock: 'cam lock',
  brad_nail: 'brad nail',
  runner: 'runner',
};

/** The selected part: its sizes and where it sits, editable, and how it's joined. */
export function Inspector({ spec, labels, selected, onChange }: InspectorProps) {
  const part = spec.parts.find((p) => p.id === selected);
  if (!part) {
    return <p className={styles.empty}>Select a part in the list or on a drawing to see and change its sizes.</p>;
  }
  const group = labels.byPart.get(part.id)!;
  const b = board(part);
  const names = new Map(spec.parts.map((p) => [p.id, p]));
  const joints = spec.joints.filter((j) => j.a === part.id || j.b === part.id);
  const assumed = SIZE.filter((s) => part.confidence[s.axis] === 'assumed');

  const update = (patch: (p: Part) => Part) => onChange({ ...spec, parts: spec.parts.map((p) => (p.id === part.id ? patch(p) : p)) });
  const setSize = (axis: Axis, v: number) =>
    update((p) => ({ ...p, size: { ...p.size, [axis]: v }, confidence: { ...p.confidence, [axis]: 'measured' } }));
  const setPos = (axis: Axis, v: number) => update((p) => ({ ...p, position: { ...p.position, [axis]: v } }));

  return (
    <div className={styles.inspector}>
      <div className={styles.head}>
        <span className={styles.letter}>{group.letter}</span>
        <div className={styles.title}>
          <div className={styles.name}>{part.name}</div>
          <div className={styles.meta}>
            {group.quantity > 1 ? `${group.quantity}× · ` : ''}
            {part.material}
          </div>
        </div>
      </div>
      <div className={styles.board}>
        Board <span className={styles.mono}>{dims(b.length, b.width, b.thickness)}</span>
      </div>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Size</legend>
        {SIZE.map(({ axis, label }) => (
          <NumberRow
            key={axis}
            id={`size-${axis}`}
            label={label}
            value={part.size[axis]}
            attention={part.confidence[axis] === 'assumed'}
            onCommit={(v) => setSize(axis, v)}
            mark={<ConfidenceMark value={part.confidence[axis]} showLabel />}
          />
        ))}
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Position</legend>
        <p className={styles.hint}>From the front-left-bottom corner of the piece.</p>
        {SIZE.map(({ axis }) => (
          <NumberRow key={axis} id={`pos-${axis}`} label={axis.toUpperCase()} value={part.position[axis]} onCommit={(v) => setPos(axis, v)} />
        ))}
      </fieldset>

      {assumed.length > 0 && (
        <Callout tone="highlight" title="Check with a tape measure">
          The {assumed.map((s) => s.label.toLowerCase()).join(' and ')} can't be read from the photos. If {assumed.length > 1 ? "they're" : "it's"} different,
          change {assumed.length > 1 ? 'them' : 'it'} here. Other parts don't move by themselves yet: the checks above show what no longer fits.
        </Callout>
      )}

      <div className={styles.group}>
        <h3 className={styles.legend}>Joints</h3>
        {joints.length === 0 ? (
          <p className={styles.hint}>Not joined to anything.</p>
        ) : (
          <ul className={styles.joints}>
            {joints.map((j, i) => {
              const other = names.get(j.a === part.id ? j.b : j.a);
              const letter = other ? labels.byPart.get(other.id)?.letter : '?';
              return (
                <li key={i}>
                  <span>
                    to {letter} · {other?.name ?? 'unknown'}
                  </span>
                  <span className={styles.mono}>
                    {j.count > 1 ? `${j.count}× ` : ''}
                    {METHOD[j.method] ?? j.method}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {part.notes && <p className={styles.hint}>{part.notes}</p>}
    </div>
  );
}

function NumberRow({ id, label, value, onCommit, mark, attention }: { id: string; label: string; value: number; onCommit: (v: number) => void; mark?: ReactNode; attention?: boolean }) {
  return (
    <div className={styles.row}>
      <label htmlFor={id} className={styles.rowLabel}>
        {label}
      </label>
      <Input
        id={id}
        key={value}
        mono
        inputMode="decimal"
        defaultValue={mm(value)}
        attention={attention}
        onBlur={(e) => {
          const v = Number(e.target.value.replace(',', '.'));
          if (Number.isFinite(v) && v !== value) onCommit(v);
          else e.target.value = mm(value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
      {mark && <span className={styles.rowMark}>{mark}</span>}
    </div>
  );
}
