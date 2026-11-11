import type { Vec3 } from '@/api';
import { isoScene, toScreen, type IsoItem } from '@/lib/drawing';
import styles from './IsoDrawing.module.css';

export interface IsoDrawingProps {
  items: IsoItem[];
  /** Parts drawn highlighted. */
  highlight?: Set<string>;
  selected?: string | null;
  /** Letter per part id, for callouts. */
  letters?: Map<string, string>;
  /** Which parts get a callout; all lettered parts if left out. */
  callouts?: Set<string>;
  arrows?: { from: Vec3; to: Vec3 }[];
  /** Where screws, nails and dowels go: dashed from each fixing to its hole. */
  guides?: { kind: 'screw' | 'dowel'; from: Vec3; to: Vec3; hole?: Vec3 }[];
  onSelect?: (partId: string) => void;
  label: string;
  /** Thicker lines and bigger letters, for reading at arm's length. */
  bold?: boolean;
}

/** An isometric line drawing of boards, like a flat-pack manual. */
export function IsoDrawing({ items, highlight, selected, letters, callouts, arrows, guides, onSelect, label, bold }: IsoDrawingProps) {
  const scene = isoScene(items);
  const lines = (guides ?? []).map((g) => ({ kind: g.kind, from: toScreen(g.from), to: toScreen(g.to), hole: toScreen(g.hole ?? g.to) }));
  const ends = lines.flatMap((l) => [l.from, l.to, l.hole]);
  const minX = Math.min(scene.bounds.minX, ...ends.map((p) => p.x));
  const maxX = Math.max(scene.bounds.maxX, ...ends.map((p) => p.x));
  const minY = Math.min(scene.bounds.minY, ...ends.map((p) => p.y));
  const maxY = Math.max(scene.bounds.maxY, ...ends.map((p) => p.y));
  const size = Math.max(maxX - minX, maxY - minY, 1);
  const pad = size * 0.1;
  const r = size * (bold ? 0.04 : 0.03);

  // Callouts sit up and to the left of their part, joined by a leader line.
  const calloutIds = [...scene.anchors.keys()].filter((id) => letters?.has(id) && (!callouts || callouts.has(id)));
  const placed = calloutIds.map((id, i) => {
    const a = scene.anchors.get(id)!;
    const dx = (i % 2 === 0 ? -1 : 1) * r * 1.6;
    return { id, a, c: { x: a.x + dx, y: a.y - r * 2.2 } };
  });

  return (
    <svg
      viewBox={`${minX - pad} ${minY - pad - r * 3} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2 + r * 3}`}
      className={[styles.svg, bold && styles.bold].filter(Boolean).join(' ')}
      role="img"
      aria-label={label}
    >
      {scene.faces.map((f, i) => {
        const cls = [
          styles.face,
          styles[f.face],
          highlight?.has(f.partId) && styles.highlight,
          f.partId === selected && styles.selected,
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <polygon
            key={`${f.partId}-${f.face}-${i}`}
            points={f.points.map((p) => `${p.x},${p.y}`).join(' ')}
            className={cls}
            onClick={onSelect ? () => onSelect(f.partId) : undefined}
          />
        );
      })}
      {lines.map((l, i) => (
        <g key={`g${i}`} className={styles.guide} aria-hidden="true">
          <line x1={l.from.x} y1={l.from.y} x2={l.to.x} y2={l.to.y} />
          {l.kind === 'screw' ? <circle className={styles.head} cx={l.from.x} cy={l.from.y} r={r * 0.22} /> : <circle className={styles.hole} cx={l.from.x} cy={l.from.y} r={r * 0.16} />}
          <circle className={styles.hole} cx={l.hole.x} cy={l.hole.y} r={r * 0.16} />
        </g>
      ))}
      {arrows?.map((ar, i) => {
        const from = toScreen(ar.from);
        const to = toScreen(ar.to);
        const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
        const ux = (to.x - from.x) / len;
        const uy = (to.y - from.y) / len;
        const s = { x: from.x + ux * len * 0.15, y: from.y + uy * len * 0.15 };
        const e = { x: to.x - ux * len * 0.25, y: to.y - uy * len * 0.25 };
        const h = r * 0.9;
        return (
          <g key={i} className={styles.arrow} aria-hidden="true">
            <line x1={s.x} y1={s.y} x2={e.x} y2={e.y} />
            <polyline
              points={`${e.x - ux * h - uy * h * 0.7},${e.y - uy * h + ux * h * 0.7} ${e.x},${e.y} ${e.x - ux * h + uy * h * 0.7},${e.y - uy * h - ux * h * 0.7}`}
            />
          </g>
        );
      })}
      {placed.map(({ id, a, c }) => (
        <g key={id} className={[styles.callout, highlight?.has(id) && styles.calloutHighlight].filter(Boolean).join(' ')}>
          <line x1={a.x} y1={a.y} x2={c.x} y2={c.y + r} />
          <circle cx={c.x} cy={c.y} r={r} />
          <text x={c.x} y={c.y} fontSize={r * 1.1} textAnchor="middle" dominantBaseline="central">
            {letters!.get(id)}
          </text>
        </g>
      ))}
    </svg>
  );
}
