import type { ReactNode } from 'react';
import styles from './FileButton.module.css';

export interface FileButtonProps {
  children: ReactNode;
  onFiles: (files: File[]) => void;
  accept?: string;
  /** Open the camera directly on phones, instead of the photo library. */
  camera?: boolean;
  multiple?: boolean;
  variant?: 'primary' | 'secondary';
  icon?: ReactNode;
  disabled?: boolean;
}

/** A button that opens the file picker (or the camera). */
export function FileButton({ children, onFiles, accept = 'image/*', camera, multiple, variant = 'secondary', icon, disabled }: FileButtonProps) {
  return (
    <label className={[styles.button, styles[variant], disabled && styles.disabled].filter(Boolean).join(' ')}>
      <input
        type="file"
        className={styles.input}
        accept={accept}
        capture={camera ? 'environment' : undefined}
        multiple={multiple}
        disabled={disabled}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (files.length) onFiles(files);
        }}
      />
      {icon}
      {children}
    </label>
  );
}
