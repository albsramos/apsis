import styles from './Spinner.module.css';

export interface SpinnerProps {
  label?: string;
  size?: number;
}

export function Spinner({ label = 'Loading', size = 20 }: SpinnerProps) {
  return <span role="status" aria-label={label} className={styles.spinner} style={{ width: size, height: size }} />;
}
