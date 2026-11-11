import { Label } from 'radix-ui';
import { useId, type ReactElement, type ReactNode } from 'react';
import styles from './Field.module.css';

export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** The control. Gets the id, so the label points at it. */
  children: (id: string) => ReactElement;
}

/** A label, a control, and an optional hint or error. */
export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId();
  return (
    <div className={styles.field}>
      <Label.Root htmlFor={id} className={styles.label}>
        {label}
      </Label.Root>
      {hint && <div className={styles.hint}>{hint}</div>}
      {children(id)}
      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
