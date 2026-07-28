export interface StepperProps {
  readonly steps: readonly string[]
  /** Zero-based index of the current step. */
  readonly current: number
}

/** The numbered-circle progress indicator on W1's re-verify-to-sign-in-to-MFA journey: a circle per step, a connecting line, a label. */
export function Stepper({ steps, current }: StepperProps) {
  return (
    <div className="ui-stepper">
      {steps.map((label, index) => (
        <div className="ui-stepper__step" key={label}>
          <div className="ui-stepper__item" data-state={index === current ? 'active' : index < current ? 'done' : 'pending'}>
            <span className="ui-stepper__circle">{index + 1}</span>
            <span className="ui-stepper__label">{label}</span>
          </div>
          {index < steps.length - 1 ? <span className="ui-stepper__connector" /> : null}
        </div>
      ))}
    </div>
  )
}
