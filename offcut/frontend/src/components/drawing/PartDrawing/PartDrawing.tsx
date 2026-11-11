import type { PartGroup, SheetHole, SheetView } from '@/lib/drawing';
import { mm } from '@/lib/format';
import { DimensionLine } from '@/components/drawing/DimensionLine';
import styles from './PartDrawing.module.css';

export interface PartDrawingProps {
  group: PartGroup;
  /** The surfaces with holes in them, if any. The face is always drawn. */
  views?: SheetView[];
}

/**
 * One board laid flat: its face with its length and width, and every surface
 * that has holes, each hole placed by its distance from two named edges.
 */
export function PartDrawing({ group, views = [] }: PartDrawingProps) {
  const L = group.length;
  const W = group.width;
  const face = views.find((v) => v.view === 'face');
  const others = views.filter((v) => v.view !== 'face');
  // One text size for every view of the board, so they read as one drawing.
  const fs = Math.max(L, W) * 0.045;
  return (
    <div className={styles.views}>
      <BoardView
        width={L}
        height={W}
        fs={fs}
        holes={face?.holes ?? []}
        title={face?.title}
        measure={face && measuredFrom(face)}
        label={`${group.name}: ${mm(L)} by ${mm(W)}, ${mm(group.thickness)} thick`}
        overall
      />
      {others.map((v) => (
        <BoardView
          key={v.title}
          width={v.width}
          height={v.height}
          fs={fs}
          holes={v.holes}
          title={v.title}
          measure={measuredFrom(v)}
          label={`${v.title} of ${group.name}, with ${v.holes.length} holes`}
        />
      ))}
    </div>
  );
}

// What the view's left and top sides are: an end, an edge or a face of the board.
const WORD: Record<SheetView['view'], [string, string]> = {
  face: ['end', 'edge'],
  edge: ['end', 'face'],
  end: ['edge', 'face'],
};

function measuredFrom(v: SheetView) {
  const [across, down] = WORD[v.view];
  return `from the ${v.left} ${across} and the ${v.top} ${down}`;
}

interface BoardViewProps {
  width: number;
  height: number;
  fs: number;
  holes: SheetHole[];
  title?: string;
  measure?: string;
  label: string;
  overall?: boolean;
}

/** One surface of a board, to scale, with ordinate dimensions to its holes. */
function BoardView({ width, height, fs, holes, title, measure, label, overall }: BoardViewProps) {
  const us = [...new Set(holes.map((h) => h.u))].sort((a, b) => a - b);
  const vs = [...new Set(holes.map((h) => h.v))].sort((a, b) => a - b);
  // Room above for the title and the positions across, left for the positions
  // down, and below and left for the overall sizes.
  const top = (title ? fs * 2.4 : 0) + (us.length ? fs * 1.6 : fs * 0.4);
  const left = (vs.length ? fs * 2.6 : fs * 0.4) + (overall ? fs * 1.8 : 0);
  const bottom = overall ? fs * 2.4 : fs * 0.6;
  const right = fs * 0.6;
  const minR = fs * 0.12;
  return (
    <svg
      viewBox={`${-left} ${-top} ${width + left + right} ${height + top + bottom}`}
      className={styles.svg}
      role="img"
      aria-label={label}
    >
      {title && (
        <text x={0} y={-top + fs * 0.8} fontSize={fs * 0.75} className={styles.title}>
          {title.toUpperCase()}
        </text>
      )}
      {measure && (
        <text x={0} y={-top + fs * 1.75} fontSize={fs * 0.65} className={styles.measure}>
          Measure {measure}
        </text>
      )}
      <rect x={0} y={0} width={width} height={height} className={styles.board} />
      {us.map((u) => (
        <g key={`u${u}`} className={styles.ordinate}>
          <line x1={u} y1={0} x2={u} y2={-fs * 0.5} />
          <text x={u} y={-fs * 0.7} fontSize={fs * 0.7} textAnchor="middle">
            {u}
          </text>
        </g>
      ))}
      {vs.map((v) => (
        <g key={`v${v}`} className={styles.ordinate}>
          <line x1={0} y1={v} x2={-fs * 0.5} y2={v} />
          <text x={-fs * 0.7} y={v} fontSize={fs * 0.7} textAnchor="end" dominantBaseline="central">
            {v}
          </text>
        </g>
      ))}
      {holes.map((h, i) => {
        const r = Math.max(h.diameter / 2, minR);
        return (
          <g key={i} className={styles.hole}>
            {h.countersink && <circle cx={h.u} cy={h.v} r={Math.max(h.diameter, minR * 2)} className={styles.countersink} />}
            <circle cx={h.u} cy={h.v} r={r} className={h.through ? styles.through : styles.blind} />
            {h.through && (
              <>
                <line x1={h.u - r * 1.8} y1={h.v} x2={h.u + r * 1.8} y2={h.v} />
                <line x1={h.u} y1={h.v - r * 1.8} x2={h.u} y2={h.v + r * 1.8} />
              </>
            )}
          </g>
        );
      })}
      {overall && (
        <>
          <DimensionLine x1={0} y1={height} x2={width} y2={height} offset={fs * 1.2} text={mm(width)} fontSize={fs} />
          <DimensionLine
            x1={-(vs.length ? fs * 2.6 : 0)}
            y1={height}
            x2={-(vs.length ? fs * 2.6 : 0)}
            y2={0}
            offset={fs * 0.6}
            text={mm(height)}
            fontSize={fs}
          />
        </>
      )}
    </svg>
  );
}
