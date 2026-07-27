import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

interface FieldWrapperProps {
  readonly label: string
  readonly htmlFor: string
  readonly hint?: string
  readonly error?: string
  readonly children: ReactNode
}

function FieldWrapper({ label, htmlFor, hint, error, children }: FieldWrapperProps) {
  return (
    <div className={`ui-field${error ? ' ui-field--invalid' : ''}`}>
      <label className="ui-field__label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? <span className="ui-field__error">{error}</span> : hint ? <span className="ui-field__hint">{hint}</span> : null}
    </div>
  )
}

export interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  readonly id: string
  readonly label: string
  readonly hint?: string
  readonly error?: string
}

/** A labelled text input, screen W1/W2/W3/W4's default. FR-nothing in particular: this is the shared form primitive every screen builds on. */
export function Field({ id, label, hint, error, className, ...rest }: FieldProps) {
  return (
    <FieldWrapper label={label} htmlFor={id} hint={hint} error={error}>
      <input id={id} className={`ui-input${className ? ` ${className}` : ''}`} {...rest} />
    </FieldWrapper>
  )
}

export interface SelectFieldOption {
  readonly value: string
  readonly label: string
}

export interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  readonly id: string
  readonly label: string
  readonly hint?: string
  readonly error?: string
  readonly options: readonly SelectFieldOption[]
}

export function SelectField({ id, label, hint, error, options, className, ...rest }: SelectFieldProps) {
  return (
    <FieldWrapper label={label} htmlFor={id} hint={hint} error={error}>
      <select id={id} className={`ui-select${className ? ` ${className}` : ''}`} {...rest}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldWrapper>
  )
}
