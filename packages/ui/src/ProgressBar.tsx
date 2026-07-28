export interface ProgressBarProps {
  readonly value: number
  readonly max: number
  readonly label?: string
}

/** The daily-limit usage bar on screen W2 (FR-12), also fits any other "used X of Y" meter. */
export function ProgressBar({ value, max, label }: ProgressBarProps) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div>
      <div className="ui-progress">
        <div className="ui-progress__fill" style={{ width: `${pct}%` }} />
      </div>
      {label ? <div className="ui-row__meta" style={{ marginTop: 'var(--space-2)' }}>{label}</div> : null}
    </div>
  )
}
