import type { Confidence } from '@/api';
import styles from './ConfidenceMark.module.css';

const TEXT: Record<Confidence, string> = {
  measured: 'measured',
  derived: 'read from the photos',
  assumed: 'assumed: check it',
};

/** Where a number came from: a full dot is measured, half is read off the photos, empty is assumed. */
export function ConfidenceMark({ value, showLabel = false }: { value: Confidence; showLabel?: boolean }) {
  return (
    <span className={`${styles.mark} ${styles[value]}`} title={TEXT[value]}>
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <circle cx="6" cy="6" r="5" className={styles.ring} />
        {value === 'measured' && <circle cx="6" cy="6" r="5" className={styles.fill} />}
        {value === 'derived' && <path d="M6 1a5 5 0 0 0 0 10z" className={styles.fill} />}
      </svg>
      {showLabel ? <span>{value}</span> : <span className={styles.srOnly}>{TEXT[value]}</span>}
    </span>
  );
}
