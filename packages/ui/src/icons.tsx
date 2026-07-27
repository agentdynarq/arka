import type { SVGProps } from 'react'

/**
 * Hand-written inline SVGs, not an icon library dependency: the portfolio-
 * wide convention in this codebase is boring, dependency-free tooling, and
 * six icons do not earn a package. Add here as new ones are needed.
 */
type IconProps = SVGProps<SVGSVGElement>

const base = { width: 32, height: 32, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 }

export function ReceiptIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2z" strokeLinejoin="round" />
      <path d="M8.5 8h7M8.5 12h7M8.5 16h4" strokeLinecap="round" />
    </svg>
  )
}

export function InboxIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 12h4l2 3h4l2-3h4" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M4 12 6 4h12l2 8v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-7Z" strokeLinejoin="round" />
    </svg>
  )
}

export function ShieldIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 2 4 5v6c0 5 3.4 8.5 8 11 4.6-2.5 8-6 8-11V5l-8-3Z" strokeLinejoin="round" />
      <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
