import type { ReactNode } from 'react'

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

export interface BadgeProps {
  readonly tone?: BadgeTone
  readonly children: ReactNode
}

/** A ledger confirmation status, a Cell's health, a direction. Anything that is one of a small closed set of states reads as a Badge, never plain text with an inline color. */
export function Badge({ tone = 'neutral', children }: BadgeProps) {
  return <span className={`ui-badge ui-badge--${tone}`}>{children}</span>
}
