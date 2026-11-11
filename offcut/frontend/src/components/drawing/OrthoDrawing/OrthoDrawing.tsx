import type { Spec } from '@/api';
import { mm } from '@/lib/format';
import { orthoView, type OrthoView, type ViewName } from '@/lib/drawing';
import { DimensionLine } from '@/components/drawing/DimensionLine';
import styles from './OrthoDrawing.module.css';

export interface OrthoDrawingProps {
  spec: Spec;
  selected?: string | null;
  /** Parts with errors, outlined in the danger colour. */
  flagged?: Set<string>;
  onSelect?: (partId: string) => void;
}

/**
 * Front, side and top views in third-angle projection, with the overall
 * dimensions. Units are millimetres throughout: the SVG's viewBox is in mm.
 */
export function OrthoDrawing({ spec, selected, flagged, onSelect }: OrthoDrawingProps) {
  const front = orthoView(spec, 'front');
  const side = orthoView(spec, 'side');
  const top = orthoView(spec, 'top');
  const W = front.width;
  const H = front.height;
  const D = side.width;
  const size = Math.max(W, H, D, 1);
  const gap = size * 0.28;
  const pad = size * 0.16;
  const fs = size * 0.034;

  const frontAt = { x: pad, y: pad + D + gap };
  const sideAt = { x: pad + W + gap, y: frontAt.y };
  const topAt = { x: pad, y: pad };
  const width = pad + W + gap + D + pad;
  const height = pad + D + gap + H + pad;

  const renderView = (view: OrthoView, at: { x: number; y: number }, label: string) => (
    <g key={view.name}>
      <text x={at.x} y={at.y - fs * 0.9} fontSize={fs * 0.8} className={styles.viewLabel}>
        {label}
      </text>
      {view.rects.map((r) => {
        const cls = [styles.part, r.partId === selected && styles.selected, flagged?.has(r.partId) && styles.flagged]
          .filter(Boolean)
          .join(' ');
        return (
          <rect
            key={r.partId}
            x={at.x + r.u0}
            y={at.y + (view.height - r.v1)}
            width={Math.max(r.u1 - r.u0, 0.1)}
            height={Math.max(r.v1 - r.v0, 0.1)}
            className={cls}
            onClick={onSelect ? () => onSelect(r.partId) : undefined}
          >
            <title>{spec.parts.find((p) => p.id === r.partId)?.name}</title>
          </rect>
        );
      })}
      {/* Every edge again, dashed and faint: where a nearer part hides an edge, only the dashes show. */}
      <g className={styles.hidden} aria-hidden="true">
        {view.rects.map((r) => (
          <rect key={r.partId} x={at.x + r.u0} y={at.y + (view.height - r.v1)} width={r.u1 - r.u0} height={r.v1 - r.v0} />
        ))}
      </g>
    </g>
  );

  const views: [ViewName, OrthoView, { x: number; y: number }, string][] = [
    ['top', top, topAt, 'TOP'],
    ['front', front, frontAt, 'FRONT'],
    ['side', side, sideAt, 'SIDE'],
  ];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={styles.svg}
      role="img"
      aria-label={`Front, side and top views. Overall ${mm(W)} wide, ${mm(H)} high and ${mm(D)} deep, in millimetres.`}
    >
      {views.map(([, v, at, label]) => renderView(v, at, label))}
      <DimensionLine x1={frontAt.x} y1={frontAt.y + H} x2={frontAt.x + W} y2={frontAt.y + H} offset={pad * 0.45} text={mm(W)} fontSize={fs} />
      <DimensionLine x1={frontAt.x} y1={frontAt.y + H} x2={frontAt.x} y2={frontAt.y} offset={pad * 0.45} text={mm(H)} fontSize={fs} />
      <DimensionLine x1={sideAt.x} y1={sideAt.y + H} x2={sideAt.x + D} y2={sideAt.y + H} offset={pad * 0.45} text={mm(D)} fontSize={fs} />
    </svg>
  );
}
