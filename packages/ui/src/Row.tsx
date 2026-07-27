import type { ReactNode } from 'react'

export interface RowProps {
  readonly title: ReactNode
  readonly meta?: ReactNode
  readonly value: ReactNode
  readonly valueTone?: 'positive' | 'negative' | 'neutral'
  readonly footnote?: ReactNode
}

/** One line of a history or activity list: a title and meta on the left, a value and footnote on the right. Used for transaction history, notifications, audit entries. */
export function Row({ title, meta, value, valueTone = 'neutral', footnote }: RowProps) {
  const valueClass = valueTone === 'neutral' ? 'ui-row__value' : `ui-row__value ui-row__value--${valueTone}`
  return (
    <div className="ui-row">
      <div>
        <div className="ui-row__title">{title}</div>
        {meta ? <div className="ui-row__meta">{meta}</div> : null}
      </div>
      <div>
        <div className={valueClass}>{value}</div>
        {footnote ? <div className="ui-row__meta">{footnote}</div> : null}
      </div>
    </div>
  )
}
