import { RadioGroup } from 'radix-ui';
import type { ReactNode } from 'react';
import styles from './RadioCards.module.css';

export interface RadioCardOption {
  value: string;
  label: ReactNode;
  description?: ReactNode;
}

export interface RadioCardsProps {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: RadioCardOption[];
}

/** A choice between a few options, each a large card. */
export function RadioCards({ label, value, onValueChange, options }: RadioCardsProps) {
  return (
    <RadioGroup.Root aria-label={label} value={value} onValueChange={onValueChange} className={styles.group}>
      {options.map((o) => (
        <RadioGroup.Item key={o.value} value={o.value} className={styles.card}>
          <span className={styles.dot} aria-hidden="true">
            <RadioGroup.Indicator className={styles.indicator} />
          </span>
          <span className={styles.label}>{o.label}</span>
          {o.description && <span className={styles.description}>{o.description}</span>}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}
