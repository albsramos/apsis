import type { ReactNode } from 'react';
import styles from './Page.module.css';

export interface PageProps {
  bar: ReactNode;
  children: ReactNode;
  /** Narrow, centred content (forms), or the full width (the workspace). */
  width?: 'narrow' | 'medium' | 'full';
}

export function Page({ bar, children, width = 'medium' }: PageProps) {
  return (
    <div className={styles.page}>
      {bar}
      <main className={`${styles.main} ${styles[width]}`}>{children}</main>
    </div>
  );
}
