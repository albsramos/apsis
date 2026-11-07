import type { ButtonHTMLAttributes } from 'react'
import styles from './Button.module.css'
import { cx } from '@/lib/cx'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md' | 'icon'
}

export function Button({ variant = 'secondary', size = 'md', className, ...rest }: Props) {
  return (
    <button
      type="button"
      className={cx(styles.button, styles[variant], styles[size], className)}
      {...rest}
    />
  )
}
