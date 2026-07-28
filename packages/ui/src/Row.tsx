import type { ReactNode } from 'react'

export interface RowProps {
  /** 1-2 letter initials shown in a small tinted circle, matching the recent-activity list on screen W2. */
  readonly avatar?: string
  readonly title: ReactNode
  readonly meta?: ReactNode
  readonly value: ReactNode
  readonly valueTone?: 'positive' | 'negative' | 'neutral'
  readonly footnote?: ReactNode
}

/** One line of a history or activity list: an optional avatar chip, a title and meta on the left, a value and footnote on the right. Used for transaction history, notifications, audit entries. */
export function Row({ avatar, title, meta, value, valueTone = 'neutral', footnote }: RowProps) {
  const valueClass = valueTone === 'neutral' ? 'ui-row__value' : `ui-row__value ui-row__value--${valueTone}`
  return (
    <div className="ui-row">
      <div className="ui-row__leading">
        {avatar ? <span className="ui-row__avatar">{avatar}</span> : null}
        <div>
          <div className="ui-row__title">{title}</div>
          {meta ? <div className="ui-row__meta">{meta}</div> : null}
        </div>
      </div>
      <div>
        <div className={valueClass}>{value}</div>
        {footnote ? <div className="ui-row__meta">{footnote}</div> : null}
      </div>
    </div>
  )
}
