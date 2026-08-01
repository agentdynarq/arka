import type { ReactNode } from 'react'

export type StatusWordTone = 'neutral' | 'success' | 'warning' | 'danger'

export interface StatusWordProps {
  readonly tone?: StatusWordTone
  readonly children: ReactNode
}

/** A small coloured dot plus a word: the dense-table status convention, never a filled pill. */
export function StatusWord({ tone = 'neutral', children }: StatusWordProps) {
  return (
    <span className={`ui-status-word ui-status-word--${tone}`}>
      <span className="ui-status-word__dot" aria-hidden="true" />
      {children}
    </span>
  )
}
