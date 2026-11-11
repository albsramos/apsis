import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './IconButton.module.css';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: an icon-only button needs a name for screen readers. */
  label: string;
  icon: ReactNode;
}

export function IconButton({ label, icon, className, type, ...rest }: IconButtonProps) {
  return (
    <button type={type ?? 'button'} aria-label={label} title={label} className={[styles.button, className].filter(Boolean).join(' ')} {...rest}>
      {icon}
    </button>
  );
}
