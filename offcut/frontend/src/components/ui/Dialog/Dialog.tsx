import { Dialog as RadixDialog } from 'radix-ui';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import styles from './Dialog.module.css';

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** "sheet" slides up from the bottom; use it for panels on phones. */
  variant?: 'centered' | 'sheet';
}

export function Dialog({ open, onOpenChange, title, description, children, variant = 'centered' }: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={styles.overlay} />
        <RadixDialog.Content className={`${styles.content} ${styles[variant]}`}>
          <div className={styles.header}>
            <RadixDialog.Title className={styles.title}>{title}</RadixDialog.Title>
            <RadixDialog.Close className={styles.close} aria-label="Close">
              <X size={20} aria-hidden="true" />
            </RadixDialog.Close>
          </div>
          {description ? (
            <RadixDialog.Description className={styles.description}>{description}</RadixDialog.Description>
          ) : (
            <RadixDialog.Description className={styles.hidden}>{title}</RadixDialog.Description>
          )}
          <div className={styles.body}>{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
