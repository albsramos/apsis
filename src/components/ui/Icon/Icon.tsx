import type { SVGProps } from 'react'

/** Line icons (lucide-style, 24 grid, drawn inline so nothing is fetched). */
const PATHS = {
  play: 'M7 4.5v15l12-7.5z',
  pause: 'M7 4h3.5v16H7zM13.5 4H17v16h-3.5z',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  back: 'M15 18l-6-6 6-6',
  chevron: 'M9 18l6-6-6-6',
  up: 'M6 15l6-6 6 6',
  follow: 'M12 3v3M12 18v3M3 12h3M18 12h3M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  thermo: 'M14 14.76V4a2 2 0 0 0-4 0v10.76a4 4 0 1 0 4 0z',
  alert: 'M12 3l10 18H2zM12 10v4M12 17.5v.01',
  orbit: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM3.5 15.5C2 12 6 6.5 12 4.5s10.5 0 10 3.5M20.5 8.5C22 12 18 17.5 12 19.5s-10.5 0-10-3.5',
  live: 'M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM7 7a7 7 0 0 0 0 10M17 7a7 7 0 0 1 0 10',
  check: 'M5 12l5 5 9-10',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  radio: 'M4.9 19.1a10 10 0 0 1 0-14.2M19.1 4.9a10 10 0 0 1 0 14.2M8.5 15.5a5 5 0 0 1 0-7M15.5 8.5a5 5 0 0 1 0 7M12 11.5v1',
  close: 'M6 6l12 12M18 6L6 18',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v5M12 7.5v.01',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 16, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  const filled = name === 'play' || name === 'pause'
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
