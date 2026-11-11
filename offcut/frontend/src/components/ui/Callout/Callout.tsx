import type { ReactNode } from 'react';
import styles from './Callout.module.css';

export type CalloutTone = 'neutral' | 'highlight' | 'success' | 'danger' | 'accent';

export interface CalloutProps {
  tone?: CalloutTone;
  title?: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}

export function Callout({ tone = 'neutral', title, icon, children, action }: CalloutProps) {
  return (
    <div className={`${styles.callout} ${styles[tone]}`} role={tone === 'danger' ? 'alert' : undefined}>
      {icon && <span className={styles.icon}>{icon}</span>}
      <div className={styles.body}>
        {title && <div className={styles.title}>{title}</div>}
        {children && <div className={styles.text}>{children}</div>}
      </div>
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
