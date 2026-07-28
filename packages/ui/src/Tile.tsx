import type { ButtonHTMLAttributes, ReactNode } from 'react'

export interface TileProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly icon: ReactNode
  readonly label: string
}

/** A quick-action tile (icon chip + label), the "Pay with QR" / "Statements" / "Limits" / "Find an agent" row on screen W2. */
export function Tile({ icon, label, className, type = 'button', ...rest }: TileProps) {
  return (
    <button type={type} className={`ui-tile${className ? ` ${className}` : ''}`} {...rest}>
      <span className="ui-tile__icon">{icon}</span>
      <span className="ui-tile__label">{label}</span>
    </button>
  )
}
