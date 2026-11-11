import styles from './DimensionLine.module.css';

export interface DimensionLineProps {
  /** The two points being measured, in the drawing's units. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** How far out from the measured edge to draw the line. Positive is to the outside (below or left). */
  offset: number;
  text: string;
  fontSize: number;
}

/**
 * An engineering dimension: extension lines, a dimension line with
 * architectural ticks, and the value. Horizontal lines are drawn below the
 * edge, vertical ones to its left.
 */
export function DimensionLine({ x1, y1, x2, y2, offset, text, fontSize }: DimensionLineProps) {
  const horizontal = Math.abs(y2 - y1) < Math.abs(x2 - x1);
  const tick = fontSize * 0.35;
  if (horizontal) {
    const y = Math.max(y1, y2) + offset;
    return (
      <g className={styles.dim}>
        <line x1={x1} y1={y1 + fontSize * 0.2} x2={x1} y2={y + tick} />
        <line x1={x2} y1={y2 + fontSize * 0.2} x2={x2} y2={y + tick} />
        <line x1={x1} y1={y} x2={x2} y2={y} />
        <line x1={x1 - tick} y1={y + tick} x2={x1 + tick} y2={y - tick} />
        <line x1={x2 - tick} y1={y + tick} x2={x2 + tick} y2={y - tick} />
        <text x={(x1 + x2) / 2} y={y + fontSize * 1.25} fontSize={fontSize} textAnchor="middle">
          {text}
        </text>
      </g>
    );
  }
  const x = Math.min(x1, x2) - offset;
  const cy = (y1 + y2) / 2;
  return (
    <g className={styles.dim}>
      <line x1={x1 - fontSize * 0.2} y1={y1} x2={x - tick} y2={y1} />
      <line x1={x2 - fontSize * 0.2} y1={y2} x2={x - tick} y2={y2} />
      <line x1={x} y1={y1} x2={x} y2={y2} />
      <line x1={x - tick} y1={y1 + tick} x2={x + tick} y2={y1 - tick} />
      <line x1={x - tick} y1={y2 + tick} x2={x + tick} y2={y2 - tick} />
      <text x={x - fontSize * 0.5} y={cy} fontSize={fontSize} textAnchor="middle" transform={`rotate(-90 ${x - fontSize * 0.5} ${cy})`}>
        {text}
      </text>
    </g>
  );
}
