import type { HTMLAttributes } from 'react';
import styles from './Card.module.css';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
}

export function Card({ padded = true, className, ...rest }: CardProps) {
  return <div className={[styles.card, padded && styles.padded, className].filter(Boolean).join(' ')} {...rest} />;
}
