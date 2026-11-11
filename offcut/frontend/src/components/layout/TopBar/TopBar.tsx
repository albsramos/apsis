import type { ReactNode } from 'react';
import { Link } from 'react-router';
import styles from './TopBar.module.css';

export interface TopBarProps {
  /** Breadcrumb after the app name. */
  trail?: ReactNode;
  actions?: ReactNode;
}

export function TopBar({ trail, actions }: TopBarProps) {
  return (
    <header className={styles.bar}>
      <Link to="/" className={styles.brand}>
        Offcut
      </Link>
      {trail && <div className={styles.trail}>{trail}</div>}
      <div className={styles.spacer} />
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}
