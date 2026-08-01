import type { ReactNode } from 'react'

export interface OverviewColumn {
  readonly label: ReactNode
  readonly value: ReactNode
  readonly context?: ReactNode
}

export interface OverviewStripProps {
  readonly columns: readonly OverviewColumn[]
}

/** Equal columns separated by hairlines, directly under every page header. No boxes: a label, a large mono value, one line of context. */
export function OverviewStrip({ columns }: OverviewStripProps) {
  return (
    <div className="ui-overview-strip">
      {columns.map((column, index) => (
        <div className="ui-overview-strip__col" key={index}>
          <p className="ui-overview-strip__label">{column.label}</p>
          <p className="ui-overview-strip__value">{column.value}</p>
          {column.context ? <p className="ui-overview-strip__context">{column.context}</p> : null}
        </div>
      ))}
    </div>
  )
}
