import type { ReactNode } from 'react'

export interface TimelineItemProps {
  readonly time: string
  readonly children: ReactNode
  readonly tone?: 'neutral' | 'warning' | 'danger'
}

/** One entry in a chronological feed: security events on W2, the audit trail on W5. A dot on a connecting line, a timestamp, a description. */
export function TimelineItem({ time, children, tone = 'neutral' }: TimelineItemProps) {
  return (
    <div className="ui-timeline-item">
      <span className={`ui-timeline-item__dot${tone === 'neutral' ? '' : ` ui-timeline-item__dot--${tone}`}`} aria-hidden="true" />
      <div>
        <div className="ui-timeline-item__time">{time}</div>
        <div className="ui-timeline-item__text">{children}</div>
      </div>
    </div>
  )
}
