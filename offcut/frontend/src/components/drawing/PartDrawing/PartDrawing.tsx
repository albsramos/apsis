import type { PartGroup } from '@/lib/drawing';
import { mm } from '@/lib/format';
import { DimensionLine } from '@/components/drawing/DimensionLine';
import styles from './PartDrawing.module.css';

export interface PartDrawingProps {
  group: PartGroup;
}

/** One board laid flat: its face with length and width, and its thickness. */
export function PartDrawing({ group }: PartDrawingProps) {
  const L = group.length;
  const W = group.width;
  const size = Math.max(L, W);
  const pad = size * 0.2;
  const fs = size * 0.075;
  return (
    <svg
      viewBox={`0 0 ${L + pad * 2} ${W + pad * 2}`}
      className={styles.svg}
      role="img"
      aria-label={`${group.name}: ${mm(L)} by ${mm(W)}, ${mm(group.thickness)} thick`}
    >
      <rect x={pad} y={pad * 0.6} width={L} height={W} className={styles.board} />
      <DimensionLine x1={pad} y1={pad * 0.6 + W} x2={pad + L} y2={pad * 0.6 + W} offset={pad * 0.35} text={mm(L)} fontSize={fs} />
      <DimensionLine x1={pad} y1={pad * 0.6 + W} x2={pad} y2={pad * 0.6} offset={pad * 0.35} text={mm(W)} fontSize={fs} />
    </svg>
  );
}
