import type { ReactNode } from 'react'

export type AlertTone = 'danger' | 'info' | 'success'

export interface AlertProps {
  readonly tone?: AlertTone
  readonly children: ReactNode
}

/** An error message, a warning, a confirmation banner. Replaces every ad hoc red box that used to be written inline per page. */
export function Alert({ tone = 'danger', children }: AlertProps) {
  return (
    <div className={`ui-alert ui-alert--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      {children}
    </div>
  )
}
