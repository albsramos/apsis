import type { Spec } from '@/api';
import { PartDrawing } from '@/components/drawing';
import type { Labels } from '@/lib/drawing';
import { mm } from '@/lib/format';
import styles from './PartSheets.module.css';

/** One card per unique board: what to cut, with its dimensions. */
export function PartSheets({ spec, labels, onSelect }: { spec: Spec; labels: Labels; onSelect: (id: string) => void }) {
  const byId = new Map(spec.parts.map((p) => [p.id, p]));
  return (
    <ul className={styles.grid}>
      {labels.groups.map((g) => {
        const first = byId.get(g.partIds[0]!)!;
        const assumed = Object.values(first.confidence).includes('assumed');
        return (
          <li key={g.letter} className={styles.card}>
            <button type="button" className={styles.head} onClick={() => onSelect(first.id)}>
              <span className={styles.letter}>{g.letter}</span>
              <span className={styles.name}>{g.name}</span>
              <span className={styles.qty}>{g.quantity}×</span>
            </button>
            <PartDrawing group={g} />
            <div className={styles.foot}>
              <span>{g.material}</span>
              <span className={styles.mono}>T {mm(g.thickness)}</span>
            </div>
            {assumed && <div className={styles.check}>Some sizes are assumed: check before cutting.</div>}
          </li>
        );
      })}
    </ul>
  );
}
