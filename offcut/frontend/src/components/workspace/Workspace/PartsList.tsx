import type { Spec } from '@/api';
import type { Labels } from '@/lib/drawing';
import { dims } from '@/lib/format';
import styles from './PartsList.module.css';

export interface PartsListProps {
  spec: Spec;
  labels: Labels;
  selected: string | null;
  flagged: Set<string>;
  onSelect: (partId: string) => void;
}

/** Boards by letter, then hardware. Selecting a board selects its first part. */
export function PartsList({ spec, labels, selected, flagged, onSelect }: PartsListProps) {
  const selectedGroup = selected ? labels.byPart.get(selected) : undefined;
  return (
    <div className={styles.list}>
      <div className={styles.head}>
        <h2 className={styles.heading}>Parts</h2>
        <span className={styles.meta}>
          {spec.parts.length} boards · {labels.groups.length} unique
        </span>
      </div>
      <ul className={styles.items}>
        {labels.groups.map((g) => {
          const active = g === selectedGroup;
          const bad = g.partIds.some((id) => flagged.has(id));
          return (
            <li key={g.letter}>
              <button
                type="button"
                className={[styles.item, active && styles.active].filter(Boolean).join(' ')}
                aria-pressed={active}
                onClick={() => onSelect(active && g.partIds.length > 1 ? nextOf(g.partIds, selected!) : g.partIds[0]!)}
              >
                <span className={[styles.letter, active && styles.letterActive, bad && styles.letterBad].filter(Boolean).join(' ')}>{g.letter}</span>
                <span className={styles.text}>
                  <span className={styles.name}>{g.name}</span>
                  <span className={styles.dims}>{dims(g.length, g.width, g.thickness)}</span>
                </span>
                <span className={styles.qty}>{g.quantity}×</span>
              </button>
            </li>
          );
        })}
      </ul>
      {spec.hardware.length > 0 && (
        <div className={styles.hardware}>
          <h2 className={styles.heading}>Hardware</h2>
          <ul className={styles.hwItems}>
            {spec.hardware.map((h) => (
              <li key={h.id}>
                <span>{h.name}</span>
                <span className={styles.qty}>{h.quantity}×</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Clicking a selected group again steps through its parts: left side, right side.
function nextOf(ids: string[], current: string): string {
  const i = ids.indexOf(current);
  return ids[(i + 1) % ids.length]!;
}
