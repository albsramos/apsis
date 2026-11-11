import type { Fixing, Spec } from '@/api';
import { PartDrawing } from '@/components/drawing';
import { drillPatterns, holeTable, type Labels } from '@/lib/drawing';
import { mm } from '@/lib/format';
import styles from './PartSheets.module.css';

/**
 * One card per unique board: what to cut, with its dimensions, and where to
 * drill it. Boards cut the same but drilled differently get a drawing each.
 */
export function PartSheets({ spec, fixings, labels, onSelect }: { spec: Spec; fixings: Fixing[]; labels: Labels; onSelect: (id: string) => void }) {
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
            {drillPatterns(spec, fixings, g).map((pattern) => {
              const rows = holeTable(pattern);
              const several = pattern.partIds.length < g.partIds.length;
              return (
                <div key={pattern.partIds.join()} className={styles.pattern}>
                  {several && (
                    <div className={styles.patternName}>
                      {pattern.partIds.map((id) => byId.get(id)?.name ?? id).join(', ')} · {pattern.partIds.length}×
                    </div>
                  )}
                  <PartDrawing group={g} views={pattern.views} />
                  {rows.length > 0 ? (
                    <ul className={styles.holes} aria-label="Holes to drill">
                      {rows.map((r) => (
                        <li key={r.text}>
                          <span className={styles.mono}>{r.count}×</span> {r.text}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className={styles.noHoles}>Nothing to drill.</p>
                  )}
                </div>
              );
            })}
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
