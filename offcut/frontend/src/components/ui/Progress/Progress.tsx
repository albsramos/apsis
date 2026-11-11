import { Progress as RadixProgress } from 'radix-ui';
import styles from './Progress.module.css';

export interface ProgressProps {
  label: string;
  /** 0 to 100; leave out while unknown. */
  value?: number;
}

export function Progress({ label, value }: ProgressProps) {
  return (
    <RadixProgress.Root aria-label={label} value={value ?? null} className={styles.root}>
      <RadixProgress.Indicator
        className={value === undefined ? `${styles.indicator} ${styles.indeterminate}` : styles.indicator}
        style={value === undefined ? undefined : { transform: `translateX(-${100 - value}%)` }}
      />
    </RadixProgress.Root>
  );
}
