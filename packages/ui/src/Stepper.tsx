export interface StepperProps {
  readonly steps: number
  /** Zero-based index of the current step. */
  readonly current: number
}

/** The three-dot progress bar on W1's re-verify to sign-in to MFA journey, generalised to any fixed-length flow. */
export function Stepper({ steps, current }: StepperProps) {
  return (
    <div className="ui-stepper">
      {Array.from({ length: steps }, (_, index) => (
        <div
          key={index}
          className="ui-stepper__dot"
          data-state={index === current ? 'active' : index < current ? 'done' : 'pending'}
        />
      ))}
    </div>
  )
}
