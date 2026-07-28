import type { ReactNode } from 'react'

export interface SplitHeroBullet {
  readonly title: string
  readonly description: string
}

export interface SplitHeroProps {
  readonly tagline: ReactNode
  readonly headline: ReactNode
  readonly bullets: readonly SplitHeroBullet[]
  readonly footer: ReactNode
  /** The right-hand panel, typically a form. Rendered as-is, not wrapped in Panel: the caller controls its own steps/content. */
  readonly children: ReactNode
}

/**
 * Screen W1's full-bleed split layout: a dark brand panel making the trust
 * case (records survived, ledger verified, no master key) beside whatever
 * the caller renders on the right. The only screen in this app that isn't a
 * centred card on the shared Shell, since it is also the only screen
 * reachable before a session exists.
 */
export function SplitHero({ tagline, headline, bullets, footer, children }: SplitHeroProps) {
  return (
    <div className="ui-split-hero">
      <div className="ui-split-hero__panel">
        <div className="ui-split-hero__brand">
          <span className="ui-split-hero__mark" aria-hidden="true">
            A
          </span>
          <span className="ui-split-hero__wordmark">ARKA</span>
        </div>
        <p className="ui-split-hero__tagline">{tagline}</p>
        <h1 className="ui-split-hero__headline">{headline}</h1>
        <ul className="ui-split-hero__bullets">
          {bullets.map((bullet) => (
            <li key={bullet.title} className="ui-split-hero__bullet">
              <span className="ui-split-hero__bullet-dot" aria-hidden="true" />
              <div>
                <div className="ui-split-hero__bullet-title">{bullet.title}</div>
                <div className="ui-split-hero__bullet-description">{bullet.description}</div>
              </div>
            </li>
          ))}
        </ul>
        <p className="ui-split-hero__footer">{footer}</p>
      </div>
      <div className="ui-split-hero__content">{children}</div>
    </div>
  )
}
