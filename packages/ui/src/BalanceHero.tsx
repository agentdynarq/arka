import type { HTMLAttributes, ReactNode } from 'react'

export interface BalanceHeroProps extends HTMLAttributes<HTMLDivElement> {
  readonly label: string
  readonly amount: ReactNode
  /** A stable hook for the amount element specifically, e.g. an e2e test id, kept separate from the card's own. */
  readonly amountTestId?: string
  readonly badge?: ReactNode
  readonly hint?: ReactNode
  readonly children?: ReactNode
}

/** The dark gradient balance card on screen W2: the one place the customer app borrows the dark register's weight, since this is the number that matters most on the page. */
export function BalanceHero({ label, amount, amountTestId, badge, hint, children, className, ...rest }: BalanceHeroProps) {
  return (
    <div className={`ui-balance-hero${className ? ` ${className}` : ''}`} {...rest}>
      <div className="ui-balance-hero__label">{label}</div>
      <div className="ui-balance-hero__amount" data-testid={amountTestId}>
        {amount}
      </div>
      {badge ? <div className="ui-balance-hero__badge">{badge}</div> : null}
      {hint ? <div className="ui-balance-hero__hint">{hint}</div> : null}
      {children ? <div className="ui-balance-hero__actions">{children}</div> : null}
    </div>
  )
}
