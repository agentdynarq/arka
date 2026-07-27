import type { ReactNode } from 'react'

export interface EmptyStateProps {
  readonly icon?: ReactNode
  readonly title: string
  readonly hint?: string
}

/** "No transactions yet" deserves more than a line of grey text: an icon and a reason, so an empty screen still looks intentional. */
export function EmptyState({ icon, title, hint }: EmptyStateProps) {
  return (
    <div className="ui-empty">
      {icon ? <span className="ui-empty__icon">{icon}</span> : null}
      <span className="ui-empty__title">{title}</span>
      {hint ? <span className="ui-empty__hint">{hint}</span> : null}
    </div>
  )
}
