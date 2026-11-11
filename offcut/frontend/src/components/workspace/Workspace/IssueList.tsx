import { AlertTriangle, Info } from 'lucide-react';
import type { Issue } from '@/api';
import { Button } from '@/components/ui';
import styles from './IssueList.module.css';

export interface IssueListProps {
  issues: Issue[];
  letters: Map<string, string>;
  /** Part id → name, to write messages in the user's terms. */
  names: Map<string, string>;
  onSelect: (partId: string) => void;
  onFitOverall: () => void;
}

/** What the validator found, errors first. Each names the parts it's about. */
export function IssueList({ issues, letters, names, onSelect, onFitOverall }: IssueListProps) {
  // The validator's messages name parts by id, for the model. Show the
  // letter and name instead: "side_left" becomes "B (Side)".
  const humanize = (text: string) =>
    text.replace(/"([a-z0-9_]+)"/g, (whole, id: string) => (letters.has(id) ? `${letters.get(id)} (${names.get(id)})` : whole));
  const sorted = [...issues].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1));
  const canFit = issues.some((i) => i.code === 'overall_mismatch');
  return (
    <section className={styles.list} aria-label="Checks">
      <ul className={styles.items}>
        {sorted.map((i, n) => (
          <li key={n} className={i.severity === 'error' ? styles.error : styles.warning}>
            {i.severity === 'error' ? <AlertTriangle size={16} aria-hidden="true" /> : <Info size={16} aria-hidden="true" />}
            <span className={styles.message}>{humanize(i.message)}</span>
            {i.parts?.map((id) => (
              <button key={id} type="button" className={styles.part} onClick={() => onSelect(id)} aria-label={`Select part ${letters.get(id) ?? id}`}>
                {letters.get(id) ?? '?'}
              </button>
            ))}
          </li>
        ))}
      </ul>
      {canFit && (
        <Button variant="ghost" onClick={onFitOverall}>
          Make the overall size match the parts
        </Button>
      )}
    </section>
  );
}
