import { Slot } from 'radix-ui';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** An icon before the label. */
  icon?: ReactNode;
  /** Render the child (e.g. a router Link) with button styles instead of a <button>. */
  asChild?: boolean;
  fullWidth?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  asChild,
  fullWidth,
  className,
  children,
  type,
  ...rest
}: ButtonProps) {
  const cls = [styles.button, styles[variant], styles[size], fullWidth && styles.full, className].filter(Boolean).join(' ');
  if (asChild) {
    return (
      <Slot.Root className={cls} {...rest}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button type={type ?? 'button'} className={cls} {...rest}>
      {icon}
      {children}
    </button>
  );
}
