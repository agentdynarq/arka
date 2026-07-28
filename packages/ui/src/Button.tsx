import type { ButtonHTMLAttributes } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'teal'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant
  /** Full width is the default, matching a form's primary action; auto-width buttons opt out. */
  readonly fullWidth?: boolean
}

export function Button({ variant = 'primary', fullWidth = true, className, type = 'button', ...rest }: ButtonProps) {
  const classes = ['ui-button', `ui-button--${variant}`, !fullWidth && 'ui-button--auto', className].filter(Boolean).join(' ')
  return <button type={type} className={classes} {...rest} />
}
