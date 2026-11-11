import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';
import styles from './Input.module.css';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Monospace, for numbers and ids. */
  mono?: boolean;
  /** Draw attention: the value should be checked. */
  attention?: boolean;
  /** Text after the input, e.g. "mm". */
  suffix?: string;
}

export function Input({ mono, attention, suffix, className, ...rest }: InputProps) {
  const input = (
    <input className={[styles.input, mono && styles.mono, attention && styles.attention, className].filter(Boolean).join(' ')} {...rest} />
  );
  if (!suffix) return input;
  return (
    <span className={styles.withSuffix}>
      {input}
      <span className={styles.suffix}>{suffix}</span>
    </span>
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={[styles.input, styles.textarea, className].filter(Boolean).join(' ')} {...rest} />;
}
