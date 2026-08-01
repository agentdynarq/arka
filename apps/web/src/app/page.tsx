import Link from 'next/link'
import { existsSync } from 'node:fs'
import path from 'node:path'

/**
 * Homepage for Duothan 6.0 judges, not the customer app itself. A pure
 * Server Component: no "use client", no state, no fetch, so it renders
 * identically with the backend down and with JS disabled. Every value below
 * is real, pulled from README.md, docs/RUNBOOK.md and the actual
 * docs/media/isolation.cast and quarantine.cast recordings, not invented.
 *
 * Ten sections, ten distinct layout archetypes, no two consecutive sections
 * sharing one. One content grid throughout: one max-width, one left margin,
 * one section padding value.
 *
 * Font no longer loaded here (chore/indigo-tokens): Source Serif 4 is now
 * loaded app-wide in apps/web/src/app/layout.tsx, the same variable class
 * already reaching this page by inheritance, so a second, page-scoped
 * next/font/google call would just fetch the same font file twice.
 */

/** Product showcase (lane-b/furnishing): Lane A is capturing real screenshots
 *  and will push them to apps/web/public/media at these exact filenames
 *  around 21:00. Checked at render time (this is a Server Component, so
 *  `existsSync` runs on the server, not the client) rather than hardcoded
 *  true/false, so the real images drop in with zero code change the moment
 *  they land -- no redeploy of this file needed, just the new PNGs. */
function screenshotExists(filename: string): boolean {
  return existsSync(path.join(process.cwd(), 'public', 'media', filename))
}

export default function Home() {
  return (
    <div className="dw">
      <nav className="dw-nav" aria-label="Primary">
        <div className="dw-nav__inner">
          <span className="dw-nav__brand">ARKA</span>
          <div className="dw-nav__links">
            <a href="#failure">The failure</a>
            <a href="#doctrines">Doctrines</a>
            <a href="#proof">Proof</a>
            <a href="#scope">Honest scope</a>
            <Link href="/judges">Judges</Link>
          </div>
          <div className="dw-nav__actions">
            <a href="#architecture" className="dw-nav__secondary">
              Read the architecture
            </a>
            <Link href="/reverify" className="dw-nav__primary">
              Run the live demo
            </Link>
          </div>
        </div>
      </nav>

      {/* 00 · HERO — an indigo flood panel, inset from the page edges, the
          one deliberate break from the rest of the page's one-grid system
          (see the file header comment). Everything that was here before
          the flood pass is still here: the gapped transaction line, the
          NO ROUTE EXISTS dimension label, the stat strip — recoloured
          onto var(--ink)/var(--on-flood-soft) rather than paper, which
          they already resolve to correctly through the alias chain
          @arka/ui/tokens.css and this file's own primitives both went
          through in chore/indigo-tokens. Nothing about the diagram itself
          changed. */}
      <header className="dw-zone dw-hero">
        <div className="dw-hero__flood">
          <div className="dw-hero__bloom" aria-hidden="true" />
          <div className="dw-zone__inner dw-section">
            <span className="dw-hero__pill">Team True Node &middot; Duothan 6.0 &middot; Phase 2</span>
            <h1 className="dw-hero__claim">
              Banking that
              <br />
              survives.
            </h1>

            <p className="dw-hero__sub">
              The 2065 collapse was an architecture failure. Arka rebuilds banking so one compromise cannot become
              a total one.
            </p>
            <div className="dw-hero__actions">
              <Link href="/reverify" className="dw-cta-primary dw-cta-primary--flood">
                Run the live demo
              </Link>
              <a href="#architecture" className="dw-cta-secondary dw-cta-secondary--flood">
                Read the architecture
              </a>
            </div>
            <p className="dw-hero__credentials">
              alice / demo-password-123 &middot; MFA code printed to the server console on boot
            </p>

            <div className="dw-hero__line">
            <svg
              className="dw-hero__line-svg dw-hero__line-svg--desktop"
              viewBox="0 0 1000 170"
              width="100%"
              preserveAspectRatio="none"
              style={{ overflow: 'visible' }}
              role="img"
              aria-labelledby="hero-line-title hero-line-desc"
            >
              <title id="hero-line-title">The transaction path, with no route between Cell 1 and Cell 2</title>
              <desc id="hero-line-desc">
                Identity, accounts, payments and ledger, in Cell 1 and again in Cell 2. Between the two groups the
                line is simply absent, dimensioned as a measured gap: no route exists.
              </desc>
              <line x1="0" y1="65" x2="410" y2="65" stroke="var(--plate-line)" />
              <line x1="590" y1="65" x2="1000" y2="65" stroke="var(--plate-line)" />

              {[
                ['IDENTITY', 30],
                ['ACCOUNTS', 157],
                ['PAYMENTS', 283],
                ['LEDGER', 400],
              ].map(([label, x]) => (
                <g key={`l-${label}`}>
                  <line x1={x} y1="59" x2={x} y2="71" stroke="var(--plate-line)" />
                  <text x={x} y="45" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="11" letterSpacing="0.04em" fill="var(--plate-ink-soft)">
                    {label}
                  </text>
                </g>
              ))}
              <text x="205" y="90" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="10" letterSpacing="0.08em" fill="var(--plate-ink-soft)">
                CELL 1
              </text>

              {[
                ['IDENTITY', 600],
                ['ACCOUNTS', 723],
                ['PAYMENTS', 846],
                ['LEDGER', 970],
              ].map(([label, x]) => (
                <g key={`r-${label}`}>
                  <line x1={x} y1="59" x2={x} y2="71" stroke="var(--plate-line)" />
                  <text x={x} y="45" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="11" letterSpacing="0.04em" fill="var(--plate-ink-soft)">
                    {label}
                  </text>
                </g>
              ))}
              <text x="795" y="90" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="10" letterSpacing="0.08em" fill="var(--plate-ink-soft)">
                CELL 2
              </text>

              {/* True dimension line across the void: vertical end-caps at
                  its boundaries, a horizontal measure between them. */}
              <line x1="410" y1="115" x2="410" y2="135" stroke="var(--blue-plate)" />
              <line x1="590" y1="115" x2="590" y2="135" stroke="var(--blue-plate)" />
              <line x1="410" y1="125" x2="590" y2="125" stroke="var(--blue-plate)" strokeDasharray="4 4" />
              <text x="500" y="157" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="16" letterSpacing="0.06em" fill="var(--plate-ink)">
                NO ROUTE EXISTS
              </text>

              <ellipse className="dw-hero-packet dw-hero-packet--left" rx="5" ry="3" />
              <ellipse className="dw-hero-packet dw-hero-packet--right" rx="5" ry="3" />
              <g className="dw-hero-extinguish">
                <line x1="396" y1="61" x2="404" y2="69" />
                <line x1="404" y1="61" x2="396" y2="69" />
              </g>
            </svg>

            <svg
              className="dw-hero__line-svg dw-hero__line-svg--mobile"
              viewBox="0 0 400 170"
              width="100%"
              preserveAspectRatio="none"
              style={{ overflow: 'visible' }}
              aria-hidden="true"
            >
              <line x1="0" y1="65" x2="160" y2="65" stroke="var(--plate-line)" />
              <line x1="240" y1="65" x2="400" y2="65" stroke="var(--plate-line)" />
              <text x="80" y="90" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="12" letterSpacing="0.08em" fill="var(--plate-ink-soft)">
                CELL 1
              </text>
              <text x="320" y="90" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="12" letterSpacing="0.08em" fill="var(--plate-ink-soft)">
                CELL 2
              </text>
              <line x1="160" y1="105" x2="160" y2="125" stroke="var(--plate-ink-soft)" />
              <line x1="240" y1="105" x2="240" y2="125" stroke="var(--plate-ink-soft)" />
              <line x1="160" y1="115" x2="240" y2="115" stroke="var(--plate-ink-soft)" strokeDasharray="4 4" />
              <text x="200" y="147" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="14" letterSpacing="0.05em" fill="var(--plate-ink)">
                NO ROUTE
              </text>
              <ellipse className="dw-hero-packet dw-hero-packet--left-mobile" rx="4" ry="2.5" />
              <ellipse className="dw-hero-packet dw-hero-packet--right-mobile" rx="4" ry="2.5" />
              <g className="dw-hero-extinguish dw-hero-extinguish--mobile">
                <line x1="156" y1="61" x2="164" y2="69" />
                <line x1="164" y1="61" x2="156" y2="69" />
              </g>
            </svg>

            <div className="dw-hero__numbers">
              <span>2 CELLS</span>
              <span>0 SHARED NETWORK PATHS</span>
              <span>29 LEDGER RECORDS</span>
              <span>RPO 0</span>
            </div>
          </div>
            <p className="dw-caption">Fig. 1 &mdash; The transaction path. No route between Cell 1 and Cell 2.</p>
          </div>
        </div>
      </header>

      {/* Value strip — immediately below the hero, full width, on --dw-panel.
          Four measured values, not four invented claims: same numbers as
          the hero's own stat strip and the verify-ledger terminal below,
          restated as one line each instead of a mono-only capsule row. */}
      <section className="dw-zone dw-value-strip" style={{ '--rule-delay': '30ms' } as React.CSSProperties}>
        <div className="dw-value-strip__inner dw-section">
          <div className="dw-value-strip__item">
            <span className="dw-mono">2</span> Cells, zero shared network paths
          </div>
          <div className="dw-value-strip__item">
            <span className="dw-mono">29</span> ledger records, <span className="dw-mono">0</span> tampered
          </div>
          <div className="dw-value-strip__item">
            RPO <span className="dw-mono">0</span> &mdash; restored from verified ledger
          </div>
          <div className="dw-value-strip__item">
            <span className="dw-mono">403</span> on the quarantined Cell, <span className="dw-mono">200</span> everywhere else
          </div>
        </div>
      </section>

      {/* PRODUCT SHOWCASE — unnumbered interstitial, like the value strip
          above it, not one of the file's own ten numbered chapters.
          Screenshots become the brightest thing on the page now that the
          ground is dark, which is exactly right, so .dw-showcase__img
          carries no filter/opacity/tint of any kind. Stand-ins render at
          the identical 1440x900 aspect until Lane A's real captures land
          at these exact paths, so the layout never shifts. */}
      <section className="dw-zone" style={{ '--rule-delay': '90ms' } as React.CSSProperties}>
        <div className="dw-zone__inner dw-section">
          <span className="dw-eyebrow">See it, not just a claim about it</span>
          <h2 className="dw-heading dw-heading--lg">The actual customer dashboard, the actual console.</h2>

          <figure className="dw-showcase__figure dw-showcase__figure--large">
            {screenshotExists('01-customer-dashboard.png') ? (
              <img
                src="/media/01-customer-dashboard.png"
                alt="The customer dashboard: balance, recent activity, and the daily transfer limit, from a real seeded account."
                className="dw-showcase__img"
              />
            ) : (
              <div className="dw-showcase__stand-in" role="img" aria-label="Customer dashboard screenshot, not yet captured">
                <span>01-customer-dashboard.png</span>
              </div>
            )}
          </figure>
          <p className="dw-caption">Customer dashboard, screen W2 &mdash; a real seeded account, not a mockup.</p>

          <div className="dw-showcase__pair">
            <figure className="dw-showcase__figure">
              {screenshotExists('03-console-health-map.png') ? (
                <img
                  src="/media/03-console-health-map.png"
                  alt="The Recovery Console health map: both Cells shown healthy, quarantine controls per Cell."
                  className="dw-showcase__img"
                />
              ) : (
                <div className="dw-showcase__stand-in" role="img" aria-label="Console health map screenshot, not yet captured">
                  <span>03-console-health-map.png</span>
                </div>
              )}
            </figure>
            <figure className="dw-showcase__figure">
              {screenshotExists('04-console-integrity-audit.png') ? (
                <img
                  src="/media/04-console-integrity-audit.png"
                  alt="The Recovery Console integrity audit: the ledger hash chain walked block by block, both Cells clean."
                  className="dw-showcase__img"
                />
              ) : (
                <div className="dw-showcase__stand-in" role="img" aria-label="Console integrity audit screenshot, not yet captured">
                  <span>04-console-integrity-audit.png</span>
                </div>
              )}
            </figure>
          </div>
          <p className="dw-caption">Recovery Console &mdash; health map (screen W5) and integrity audit (screen W6).</p>
        </div>
      </section>

      {/* 01 · THE FAILURE — full-bleed diagram, mono eyebrow as the only heading */}
      <section className="dw-zone" id="failure" style={{ '--rule-delay': '60ms' } as React.CSSProperties}>
        <div className="dw-zone__inner dw-section">
          <span className="dw-eyebrow">
            <span className="dw-eyebrow__n">01</span>The failure &mdash; one trust domain, one network, one Master Key
          </span>

          <div className="dw-plate">
            <div className="dw-diagram">
            <svg viewBox="0 0 1180 340" width="100%" role="img" aria-labelledby="fail-title fail-desc">
              <title id="fail-title">Pre-collapse architecture compared with Arka</title>
              <desc id="fail-desc">
                Before: every service and the one Master Key sit inside a single undivided trust domain. After:
                Arka splits the same services into two paired, labelled Cells with no route between them.
              </desc>

              <rect x="0" y="20" width="480" height="300" fill="none" stroke="var(--plate-ink-soft)" strokeDasharray="2 4" />
              <text x="20" y="46" fontFamily="var(--font-mono)" fontSize="11" letterSpacing="0.06em" fill="var(--plate-ink-soft)">
                PRE-COLLAPSE &middot; ONE TRUST DOMAIN
              </text>
              {['IDENTITY', 'ACCOUNTS', 'PAYMENTS', 'LEDGER', 'NOTIFICATIONS'].map((svc, i) => (
                <g key={svc}>
                  <rect x={20} y={68 + i * 34} width={230} height={26} fill="none" stroke="var(--plate-line)" />
                  <text x={32} y={68 + i * 34 + 17} fontFamily="var(--font-mono)" fontSize="10" fill="var(--plate-ink-soft)">
                    {svc}
                  </text>
                </g>
              ))}
              <rect x="270" y="68" width="190" height="200" fill="none" stroke="var(--plate-ink-soft)" strokeDasharray="2 3" />
              <text x="282" y="90" fontFamily="var(--font-mono)" fontSize="10" fill="var(--plate-ink-soft)">
                MASTER KEY
              </text>
              <text x="282" y="106" fontFamily="var(--font-mono)" fontSize="8" fill="var(--plate-ink-soft)">
                one artifact, total
              </text>
              <text x="282" y="120" fontFamily="var(--font-mono)" fontSize="8" fill="var(--plate-ink-soft)">
                recovery authority
              </text>

              <line x1="510" y1="170" x2="590" y2="170" stroke="var(--plate-ink-soft)" />
              <polygon points="590,170 578,164 578,176" fill="var(--plate-ink-soft)" />

              <rect x="875" y="20" width="30" height="300" fill="var(--plate)" />
              <rect x="620" y="20" width="255" height="300" fill="var(--plate-fill-2)" stroke="var(--plate-line)" />
              <text x="640" y="46" fontFamily="var(--font-mono)" fontSize="12" fontWeight={700} fill="var(--plate-ink)">
                CELL 1
              </text>
              <text x="640" y="62" fontFamily="var(--font-mono)" fontSize="9" fill="var(--plate-ink-soft)">
                CELL_ID=cell-1
              </text>
              <line x1="748" y1="86" x2="748" y2="300" stroke="var(--verified)" strokeWidth="1.5" />

              <rect x="905" y="20" width="255" height="300" fill="var(--plate-fill-2)" stroke="var(--plate-line)" />
              <text x="925" y="46" fontFamily="var(--font-mono)" fontSize="12" fontWeight={700} fill="var(--plate-ink)">
                CELL 2
              </text>
              <text x="925" y="62" fontFamily="var(--font-mono)" fontSize="9" fill="var(--plate-ink-soft)">
                CELL_ID=cell-2
              </text>
              <line x1="1033" y1="86" x2="1033" y2="300" stroke="var(--verified)" strokeWidth="1.5" />

              <text x="890" y="174" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="8" letterSpacing="0.04em" fill="var(--plate-ink-soft)">
                NO ROUTE
              </text>
            </svg>
            </div>
          </div>
          <p className="dw-caption">
            Fig. 2 &mdash; Arka splits the same services into <strong>two Cells with no route between them</strong>.
          </p>
        </div>
      </section>

      {/* CONTRAST PAIR — unnumbered, like the value strip and the product
          showcase above it. Restates the same claim sections 01 and 03
          already make, in a visual device neither of those uses: two
          panels side by side, chaos against calm, same real service names
          and the same real quarantine outcome as the rest of the page, not
          new figures. */}
      <section className="dw-zone" style={{ '--rule-delay': '150ms' } as React.CSSProperties}>
        <div className="dw-contrast">
          <div className="dw-contrast__col dw-contrast__col--collapse">
            <div className="dw-contrast__inner">
              <h2 className="dw-heading dw-heading--lg">One trust domain. One network. One Master Key.</h2>
              <div className="dw-contrast__cards">
                <div className="dw-contrast__card dw-contrast__card--1">
                  <span className="dw-contrast__chip">STATUS: UNRESOLVED</span>
                  <span>IDENTITY unreachable</span>
                </div>
                <div className="dw-contrast__card dw-contrast__card--2">
                  <span className="dw-contrast__chip">STATUS: UNRESOLVED</span>
                  <span>LEDGER writes failing</span>
                </div>
                <div className="dw-contrast__card dw-contrast__card--3">
                  <span className="dw-contrast__chip">STATUS: UNRESOLVED</span>
                  <span>MASTER KEY compromised</span>
                </div>
              </div>
              <div className="dw-contrast__store">
                <div className="dw-contrast__store-services">
                  {['IDENTITY', 'ACCOUNTS', 'PAYMENTS', 'LEDGER', 'NOTIFICATIONS'].map((svc) => (
                    <span key={svc} className="dw-contrast__store-svc">
                      {svc}
                    </span>
                  ))}
                </div>
                <div className="dw-contrast__store-arrow" aria-hidden="true" />
                <div className="dw-contrast__store-shared">ONE SHARED STORE</div>
              </div>
            </div>
          </div>
          <div className="dw-contrast__col dw-contrast__col--contain">
            <div className="dw-contrast__inner">
              <h2 className="dw-heading dw-heading--lg dw-contrast__heading--flood">Blast radius becomes a design parameter.</h2>
              <p className="dw-contrast__confirm">
                <span className="dw-mono">cell-1 quarantined</span> &middot; <span className="dw-mono">cell-2 serving</span> &middot;{' '}
                <span className="dw-mono">0 records lost</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 02 · DOCTRINE 01 — single centered statement, the page's one quiet moment */}
      <section className="dw-zone dw-zone--tint" id="doctrines" style={{ '--rule-delay': '120ms' } as React.CSSProperties}>
        <div className="dw-zone__inner dw-section dw-section--narrow dw-doctrine-quiet">
          <span className="dw-eyebrow">
            <span className="dw-eyebrow__n">02</span>Doctrine 01 &middot; Assume breach
          </span>
          <h2 className="dw-heading dw-heading--quiet">A process that cannot prove what it is talks to nothing.</h2>
          <p className="dw-doctrine-quiet__note">
            <code>packages/workload-auth</code> &middot; <code>arka/CLAUDE.md</code>: &ldquo;No cross-cell reads.
            Only the gateway knows more than one Cell exists.&rdquo;
          </p>
        </div>
      </section>

      {/* 03 · DOCTRINE 02 — dense spec table, claim / mechanism / path / proof */}
      <section className="dw-zone" style={{ '--rule-delay': '180ms' } as React.CSSProperties}>
        <div className="dw-zone__inner dw-section">
          <span className="dw-eyebrow">
            <span className="dw-eyebrow__n">03</span>Doctrine 02 &middot; Contain by construction
          </span>
          <h2 className="dw-heading dw-heading--lg">Blast radius becomes a design parameter.</h2>

          <div className="dw-spec">
            <div className="dw-spec__row">
              <span className="dw-spec__k">Claim</span>
              <span className="dw-spec__v">A compromise is capped at one Cell. Every other Cell keeps serving.</span>
            </div>
            <div className="dw-spec__row">
              <span className="dw-spec__k">Mechanism</span>
              <span className="dw-spec__v">
                Identity, accounts, payments, ledger, notifications &mdash; own Postgres, own Redis Streams, per
                Cell.
              </span>
            </div>
            <div className="dw-spec__row">
              <span className="dw-spec__k">Path</span>
              <span className="dw-spec__v">
                <code>services/*</code>, one deploy per Cell, zero shared network paths.
              </span>
            </div>
            <div className="dw-spec__row">
              <span className="dw-spec__k">Proof</span>
              <span className="dw-spec__v">
                <span className="dw-spec__terminal">
                  <span className="dw-terminal__prompt">$</span> docker exec arka-cell1-postgres ping -c 2
                  arka-cell2-postgres
                  <br />
                  <strong>ping: bad address &lsquo;arka-cell2-postgres&rsquo;</strong>
                </span>
                <a href="#proof" className="dw-spec__link">
                  Full recording &darr; Proof
                </a>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 04 · DOCTRINE 03 — right-aligned, the page's one right-flowing section */}
      <section className="dw-zone" style={{ '--rule-delay': '240ms' } as React.CSSProperties}>
        <div className="dw-zone__inner dw-section">
          <div className="dw-doctrine-mirror">
            <span className="dw-eyebrow">
              <span className="dw-eyebrow__n">04</span>Doctrine 03 &middot; Recovery is a feature
            </span>
            <h2 className="dw-heading dw-heading--lg">There is no Master Key.</h2>
            <p className="dw-doctrine__note">3-of-5 keyholder quorum, designed &mdash; Phase 3 scope, see Honest scope.</p>
          </div>
        </div>
      </section>

      {/* 05 · ARCHITECTURE — on the grid like every other section; the void
          animation is the interest here, not the diagram's width */}
      <section className="dw-zone" id="architecture" style={{ '--rule-delay': '300ms' } as React.CSSProperties}>
        <div className="dw-zone__inner dw-section">
          <span className="dw-eyebrow">
            <span className="dw-eyebrow__n">05</span>Architecture
          </span>
          <h2 className="dw-heading dw-heading--lg">No route between them.</h2>

        <div className="dw-plate">
        <div className="dw-arch__mobile">
          <div className="dw-cell">
            <strong>API GATEWAY</strong>
            <span className="dw-cell__id">TLS &middot; OIDC + MFA &middot; Cell Router</span>
          </div>
          <div className="dw-cell">
            <strong>CELL 1</strong>
            <span className="dw-cell__id">CELL_ID=cell-1</span>
            {['IDENTITY', 'ACCOUNTS', 'PAYMENTS', 'LEDGER', 'NOTIFICATIONS'].map((svc, i) => (
              <span className="dw-cell__svc" key={svc} style={{ animationDelay: `${i * 0.4}s` }}>
                {svc}
              </span>
            ))}
            <span className="dw-cell__db">POSTGRES (own schema) &middot; REDIS STREAMS</span>
          </div>
          <div className="dw-void-mobile">
            <span className="dw-void-mobile__mark" aria-hidden="true" />
            <span>NO ROUTE EXISTS</span>
            <span>0 shared network paths</span>
          </div>
          <div className="dw-cell">
            <strong>CELL 2</strong>
            <span className="dw-cell__id">CELL_ID=cell-2</span>
            {['IDENTITY', 'ACCOUNTS', 'PAYMENTS', 'LEDGER', 'NOTIFICATIONS'].map((svc, i) => (
              <span className="dw-cell__svc" key={svc} style={{ animationDelay: `${i * 0.4}s` }}>
                {svc}
              </span>
            ))}
            <span className="dw-cell__db">POSTGRES (own schema) &middot; REDIS STREAMS</span>
          </div>
          <div className="dw-cell">
            <strong>CONTROL PLANE</strong>
            <span className="dw-cell__id">observability + audit, separate trust zone</span>
            <span className="dw-cell__db">observe + rebuild, one-way, to both Cells</span>
          </div>
        </div>

        <div className="dw-diagram dw-arch__desktop">
          <svg viewBox="0 0 1200 620" width="100%" role="img" aria-labelledby="arch-title arch-desc" style={{ overflow: 'visible' }}>
            <title id="arch-title">Arka&rsquo;s Cell architecture</title>
            <desc id="arch-desc">
              Customers, merchants and agents reach the API Gateway, the only component that knows both Cells
              exist. The Gateway routes to Cell 1 or Cell 2, each running the full service stack with its own
              Postgres and Redis Streams. There is no route between Cell 1 and Cell 2. A separate control plane
              observes and rebuilds both Cells through a one-way channel only.
            </desc>

            <rect x="470" y="20" width="260" height="64" fill="var(--plate-fill)" stroke="var(--plate-line)" />
            <text x="600" y="46" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="13" fill="var(--plate-ink)">
              API GATEWAY
            </text>
            <text x="600" y="66" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="10" fill="var(--plate-ink-soft)">
              TLS &middot; OIDC + MFA &middot; Cell Router
            </text>

            <line x1="530" y1="84" x2="300" y2="150" stroke="var(--plate-line)" />
            <line x1="670" y1="84" x2="900" y2="150" stroke="var(--plate-line)" />
            <g aria-hidden="true">
              <ellipse className="dw-arch-packet dw-arch-packet--c1" rx="5" ry="3" />
              <ellipse className="dw-arch-packet dw-arch-packet--c2" rx="5" ry="3" />
            </g>

            <g>
              <rect x="80" y="150" width="440" height="330" fill="var(--plate-fill-2)" stroke="var(--plate-line)" />
              <text x="104" y="182" fontFamily="var(--font-mono)" fontSize="14" fontWeight={700} fill="var(--plate-ink)">
                CELL 1
              </text>
              <text x="104" y="200" fontFamily="var(--font-mono)" fontSize="10" fill="var(--plate-ink-soft)">
                CELL_ID=cell-1
              </text>
              {['IDENTITY', 'ACCOUNTS', 'PAYMENTS', 'LEDGER', 'NOTIFICATIONS'].map((svc, i) => (
                <g key={svc}>
                  <rect
                    className="dw-row"
                    x={104}
                    y={218 + i * 34}
                    width={392}
                    height={26}
                    stroke="var(--plate-line)"
                    style={{ animationDelay: `${i * 0.4}s` }}
                  />
                  <text x={116} y={218 + i * 34 + 17} fontFamily="var(--font-mono)" fontSize="10" fill="var(--plate-ink)">
                    {svc}
                  </text>
                </g>
              ))}
              <rect x="104" y="392" width="190" height="34" fill="none" stroke="var(--plate-line)" />
              <text x="116" y="413" fontFamily="var(--font-mono)" fontSize="10" fill="var(--plate-ink-soft)">
                POSTGRES (own schema)
              </text>
              <rect x="306" y="392" width="190" height="34" fill="none" stroke="var(--plate-line)" />
              <text x="318" y="413" fontFamily="var(--font-mono)" fontSize="10" fill="var(--plate-ink-soft)">
                REDIS STREAMS
              </text>
              <text x="104" y="460" fontFamily="var(--font-mono)" fontSize="10" fill="var(--plate-ink-soft)">
                LEDGER_SIGNING_KEY=&lt;cell-1 key&gt;
              </text>
              <g aria-hidden="true">
                {Array.from({ length: 10 }, (_, i) => (
                  <rect
                    key={i}
                    className="dw-ledger-block"
                    x={92}
                    y={164 + i * 12}
                    width={6}
                    height={8}
                    style={{ animationDelay: `${i * 0.35}s` }}
                  />
                ))}
              </g>
            </g>

            <g>
              <rect x="680" y="150" width="440" height="330" fill="var(--plate-fill-2)" stroke="var(--plate-line)" />
              <text x="704" y="182" fontFamily="var(--font-mono)" fontSize="14" fontWeight={700} fill="var(--plate-ink)">
                CELL 2
              </text>
              <text x="704" y="200" fontFamily="var(--font-mono)" fontSize="10" fill="var(--plate-ink-soft)">
                CELL_ID=cell-2
              </text>
              {['IDENTITY', 'ACCOUNTS', 'PAYMENTS', 'LEDGER', 'NOTIFICATIONS'].map((svc, i) => (
                <g key={svc}>
                  <rect
                    className="dw-row"
                    x={704}
                    y={218 + i * 34}
                    width={392}
                    height={26}
                    stroke="var(--plate-line)"
                    style={{ animationDelay: `${i * 0.4}s` }}
                  />
                  <text x={716} y={218 + i * 34 + 17} fontFamily="var(--font-mono)" fontSize="10" fill="var(--plate-ink)">
                    {svc}
                  </text>
                </g>
              ))}
              <rect x="704" y="392" width="190" height="34" fill="none" stroke="var(--plate-line)" />
              <text x="716" y="413" fontFamily="var(--font-mono)" fontSize="10" fill="var(--plate-ink-soft)">
                POSTGRES (own schema)
              </text>
              <rect x="906" y="392" width="190" height="34" fill="none" stroke="var(--plate-line)" />
              <text x="918" y="413" fontFamily="var(--font-mono)" fontSize="10" fill="var(--plate-ink-soft)">
                REDIS STREAMS
              </text>
              <text x="704" y="460" fontFamily="var(--font-mono)" fontSize="10" fill="var(--plate-ink-soft)">
                LEDGER_SIGNING_KEY=&lt;cell-2 key&gt;
              </text>
              <g aria-hidden="true">
                {Array.from({ length: 10 }, (_, i) => (
                  <rect
                    key={i}
                    className="dw-ledger-block"
                    x={692}
                    y={164 + i * 12}
                    width={6}
                    height={8}
                    style={{ animationDelay: `${i * 0.35}s` }}
                  />
                ))}
              </g>
            </g>

            <rect x="520" y="150" width="160" height="330" fill="var(--plate)" />
            <line x1="530" y1="315" x2="670" y2="315" stroke="var(--plate-ink-soft)" strokeDasharray="4 4" />
            <line x1="530" y1="300" x2="530" y2="330" stroke="var(--plate-ink-soft)" />
            <line x1="670" y1="300" x2="670" y2="330" stroke="var(--plate-ink-soft)" />
            <text x="600" y="300" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="10" letterSpacing="0.08em" fill="var(--plate-ink-soft)">
              NO ROUTE EXISTS
            </text>
            <text x="600" y="345" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill="var(--plate-ink-soft)">
              0 SHARED NETWORK PATHS
            </text>

            <g aria-hidden="true">
              <ellipse className="dw-arch-packet dw-arch-packet--cross" rx="5" ry="3" />
              <g className="dw-void-extinguish">
                <line x1="516" y1="329" x2="524" y2="337" />
                <line x1="524" y1="329" x2="516" y2="337" />
              </g>
              <text x="600" y="380" textAnchor="middle" className="dw-tally" style={{ animationDelay: '0s' }}>
                BLOCKED &middot; 0001
              </text>
              <text x="600" y="380" textAnchor="middle" className="dw-tally" style={{ animationDelay: '-10s' }}>
                BLOCKED &middot; 0002
              </text>
              <text x="600" y="380" textAnchor="middle" className="dw-tally" style={{ animationDelay: '-20s' }}>
                BLOCKED &middot; 0003
              </text>
              <text x="600" y="380" textAnchor="middle" className="dw-tally" style={{ animationDelay: '-30s' }}>
                BLOCKED &middot; 0004
              </text>
              <text x="600" y="380" textAnchor="middle" className="dw-tally" style={{ animationDelay: '-40s' }}>
                BLOCKED &middot; 0005
              </text>
              <text x="600" y="380" textAnchor="middle" className="dw-tally" style={{ animationDelay: '-50s' }}>
                BLOCKED &middot; 0006
              </text>
            </g>

            <rect x="450" y="530" width="300" height="60" fill="var(--plate-fill)" stroke="var(--plate-line)" />
            <text x="600" y="556" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="11" fill="var(--plate-ink)">
              CONTROL PLANE
            </text>
            <text x="600" y="574" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill="var(--plate-ink-soft)">
              observability + audit, separate trust zone
            </text>
            <line x1="500" y1="530" x2="300" y2="480" stroke="var(--plate-ink-soft)" strokeDasharray="2 4" />
            <line x1="700" y1="530" x2="900" y2="480" stroke="var(--plate-ink-soft)" strokeDasharray="2 4" />
            <text x="330" y="500" fontFamily="var(--font-mono)" fontSize="8" fill="var(--plate-ink-soft)">
              observe + rebuild, one-way
            </text>
            <text x="800" y="500" fontFamily="var(--font-mono)" fontSize="8" fill="var(--plate-ink-soft)">
              observe + rebuild, one-way
            </text>
          </svg>
        </div>
        </div>

        <p className="dw-caption">
            Fig. 3 &mdash; <strong>No route exists</strong> between Cell 1 and Cell 2. The control plane observes and
            rebuilds both, one-way, and holds no customer data.
          </p>
        </div>
      </section>

      {/* 06 · PROOF — paper ground, like every other section. Only the
          verify-ledger terminal (plate d) stays dark; the status timeline
          and the 403 sit directly on paper. */}
      <section className="dw-zone" id="proof" style={{ '--rule-delay': '360ms' } as React.CSSProperties}>
        <div className="dw-zone__inner dw-section">
          <span className="dw-eyebrow">
            <span className="dw-eyebrow__n">06</span>Proof
          </span>
          <h2 className="dw-heading dw-heading--lg">Prefer verifiable to impressive.</h2>

          <div className="dw-proof__band">
            <div className="dw-terminal">
              <div className="dw-terminal__bar" aria-hidden="true">
                <span className="dw-terminal__dot" />
                <span className="dw-terminal__dot" />
                <span className="dw-terminal__dot" />
              </div>
              <div className="dw-terminal__body">
                <div>
                  <span className="dw-terminal__prompt">$</span> pnpm verify-ledger
                </div>
                <br />
                <div>Cell cell-1</div>
                <div>&nbsp;&nbsp;records: &nbsp;&nbsp;&nbsp;15</div>
                <div>
                  &nbsp;&nbsp;root hash: &nbsp;
                  <span className="dw-terminal__hash">0815d67a4a7b55c4a7b16f495de6d71a82f129993962c7252e1772b4548e60cd</span>
                </div>
                <div>
                  &nbsp;&nbsp;status: &nbsp;&nbsp;&nbsp;&nbsp;<span className="dw-terminal__clean">clean</span>
                </div>
                <br />
                <div>Cell cell-2</div>
                <div>&nbsp;&nbsp;records: &nbsp;&nbsp;&nbsp;14</div>
                <div>
                  &nbsp;&nbsp;root hash: &nbsp;
                  <span className="dw-terminal__hash">0649c96ef053493a49c163173e0a7fc593a1b827331b875230d94f9c234550ac</span>
                </div>
                <div>
                  &nbsp;&nbsp;status: &nbsp;&nbsp;&nbsp;&nbsp;<span className="dw-terminal__clean">clean</span>
                </div>
              </div>
            </div>
            <p className="dw-caption">Fig. 4 &mdash; pnpm verify-ledger, live output.</p>
            <p className="dw-provenance">Recorded 2026-07-28T18:26:41Z &middot; live stack &middot; unstaged</p>
          </div>

          <div className="dw-proof__band">
            <div className="dw-timeline">
              <div className="dw-timeline__step">
                <span className="dw-timeline__code">201</span>
                <span className="dw-timeline__detail">alice &rarr; bob, 5000 minor units. ledgerBlockSeq 15.</span>
              </div>
              <div className="dw-timeline__step">
                <span className="dw-timeline__code">201</span>
                <span className="dw-timeline__detail">operator-priya requests quarantine on cell-1. pending_second_approval.</span>
              </div>
              <div className="dw-timeline__step">
                <span className="dw-timeline__code">201</span>
                <span className="dw-timeline__detail">operator-nadeesha approves. dual approval, neither alone. quarantined.</span>
              </div>
              <div className="dw-timeline__step dw-timeline__step--loud">
                <span className="dw-timeline__code">403</span>
                <span className="dw-timeline__detail">
                  CELL_QUARANTINED &mdash; the identical transfer, rejected. cell-1 is read-only.
                </span>
              </div>
              <div className="dw-timeline__step">
                <span className="dw-timeline__code">200</span>
                <span className="dw-timeline__detail">alice&rsquo;s dashboard still reads fine. balance 95600. read-only, not down.</span>
              </div>
              <div className="dw-timeline__step">
                <span className="dw-timeline__code">201</span>
                <span className="dw-timeline__detail">operators lift the quarantine, dual approval again. state: none.</span>
              </div>
              <div className="dw-timeline__step">
                <span className="dw-timeline__code">201</span>
                <span className="dw-timeline__detail">same transfer, same account. ledgerBlockSeq 16. it works again.</span>
              </div>
            </div>
            <p className="dw-provenance">Recorded 2026-07-28 &middot; live stack &middot; unstaged &middot; FR-22</p>
          </div>

          <div className="dw-proof__links">
            <a href="/media/isolation.gif" className="dw-proof__link" target="_blank" rel="noopener noreferrer">
              See the isolation proof &rarr; <span className="dw-proof__link-size">isolation.gif &middot; 132KB, recorded terminal capture</span>
            </a>
            <a href="/media/quarantine.gif" className="dw-proof__link" target="_blank" rel="noopener noreferrer">
              Watch the quarantine, unstaged &rarr; <span className="dw-proof__link-size">quarantine.gif &middot; 781KB, recorded terminal capture</span>
            </a>
          </div>

          <p className="dw-proof__auditor">
            An <strong>auditor</strong> never has to trust this page &mdash; recompute independently with{' '}
            <code>pnpm verify-ledger</code>, or walk the chain from Recovery Console screen W6.
          </p>
        </div>
      </section>

      {/* 07 · CELL AS CONFIGURATION — compact, almost a footnote */}
      <section className="dw-zone dw-zone--tint" style={{ '--rule-delay': '420ms' } as React.CSSProperties}>
        <div className="dw-zone__inner dw-section">
          <div className="dw-config__row">
            <div>
              <span className="dw-eyebrow">
                <span className="dw-eyebrow__n">07</span>A Cell is configuration, not code
              </span>
              <p className="dw-body dw-body--tight">Adding Cell 3 is a config file, not a code change.</p>
            </div>
            <div className="dw-config__envblock">
              <div>
                <span className="k">CELL_ID</span>=<span className="v">cell-1</span>
              </div>
              <div>
                <span className="k">DATABASE_URL</span>=<span className="v">&lt;cell-1 postgres&gt;</span>
              </div>
              <div>
                <span className="k">REDIS_URL</span>=<span className="v">&lt;cell-1 redis&gt;</span>
              </div>
              <div>
                <span className="k">LEDGER_SIGNING_KEY</span>=<span className="v">&lt;cell-1 key&gt;</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 08 · SURFACES — the light paper zone, unchanged */}
      <section className="dw-zone" id="surfaces" style={{ '--rule-delay': '480ms' } as React.CSSProperties}>
        <div className="dw-zone__inner dw-section">
          <span className="dw-eyebrow">
            <span className="dw-eyebrow__n">08</span>Surfaces
          </span>
          <h2 className="dw-heading dw-heading--lg">Three surfaces. One knows both Cells exist.</h2>

          <div className="dw-surfaces__list">
            <div className="dw-surface">
              <span className="dw-surface__name">Customer app</span>
              <span className="dw-surface__body">
                Re-verification, dashboard and history, transfer with step-up. Screens W1&ndash;W4, pinned to
                exactly one Cell by the gateway&rsquo;s stable hash.
              </span>
              <span className="dw-surface__personas">
                <span className="dw-surface__persona">
                  <strong>Customer, post-collapse depositor</strong>
                  Has been burned once. Default state is suspicion. Wants proof, not reassurance.
                </span>
              </span>
            </div>

            <div className="dw-surface">
              <span className="dw-surface__name">Recovery Console</span>
              <span className="dw-surface__body">
                Cell health map and dual-approval quarantine, screen W5; append-only integrity audit, screen W6.
                Irreversible actions require a second operator, visibly, before a word is read.
              </span>
              <span className="dw-surface__personas">
                <span className="dw-surface__persona">
                  <strong>Bank operator</strong>
                  Works incidents under pressure, possibly at 3am. Needs Cell state at a glance, never ambiguous
                  between degraded and down.
                </span>
                <span className="dw-surface__persona">
                  <strong>Keyholder, one of five</strong>
                  No unilateral power over recovery, and the layout makes that visible before a word is read. The
                  quorum ceremony itself is Phase 3 scope.
                </span>
              </span>
            </div>

            <div className="dw-surface">
              <span className="dw-surface__name">API Gateway</span>
              <span className="dw-surface__body">
                TLS, OIDC + MFA, step-up, and the Cell Router. The only component in the system that knows more
                than one Cell exists.
              </span>
              <span className="dw-surface__personas">
                <span className="dw-surface__persona">
                  <strong>Merchant / agent</strong>
                  Wants settlement certainty: a receipt and a ledger entry verifiable by someone other than the
                  bank.
                </span>
                <span className="dw-surface__persona">
                  <strong>Auditor</strong>
                  Reads, never writes. Recomputes independently rather than trusting a dashboard.
                </span>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 09 · HONEST SCOPE — legal-appendix register, two columns */}
      <section className="dw-zone" id="scope" style={{ '--rule-delay': '540ms' } as React.CSSProperties}>
        <div className="dw-zone__inner dw-section">
          <span className="dw-eyebrow">
            <span className="dw-eyebrow__n">09</span>Honest scope
          </span>
          <h2 className="dw-heading dw-heading--legal">Named, not hidden.</h2>

          <ul className="dw-scope__list">
            <li className="dw-scope__item">
              <strong>Per-Cell signing keys and the 3-of-5 quorum ceremony</strong>
              Described in ADR 0003 as the target design. No cryptographic signature exists yet; tampering is
              caught by walking and recomputing the hash chain, not by a key.
            </li>
            <li className="dw-scope__item">
              <strong>Anomaly detection beyond rate limiting</strong>
              Sustained anomalous behaviour is caught by an operator reading the health map, not by an automated
              detector.
            </li>
            <li className="dw-scope__item">
              <strong>Multi-language support</strong>
              English only, this phase.
            </li>
            <li className="dw-scope__item">
              <strong>Recurring payments</strong>
              Every transfer today is a single, explicit, idempotent request.
            </li>
            <li className="dw-scope__item">
              <strong>Offline vouchers</strong>
              Agent cash-in and cash-out require a live connection.
            </li>
            <li className="dw-scope__item">
              <strong>Cloud deployment via Terraform</strong>
              Verified today with <code>docker compose up -d</code> against two local Cells. Phase 3 adds the
              deployment, the chaos rehearsal, and the live quarantine demonstration in front of a panel.
            </li>
            <li className="dw-scope__item">
              <strong>The in-app MFA code widget</strong>
              A demo-only endpoint returns the current TOTP code so a judge without an authenticator app can
              complete the FR-01&ndash;FR-03 journey. 404s unless explicitly enabled, logs a boot warning when
              it is, and never touches the real verification path. Not present in production.
            </li>
          </ul>

          <p className="dw-scope__note">
            docs/RUNBOOK.md, P4: &ldquo;Steps below are recorded as the intended procedure for when a real key
            exists, so a reviewer sees the design honestly rather than a step that would fail if actually
            attempted.&rdquo;
          </p>
        </div>
      </section>

      {/* FINAL CTA — near-empty, terminal block plus CTA, left-aligned inside a centered container */}
      <section className="dw-zone dw-final" style={{ '--rule-delay': '600ms' } as React.CSSProperties}>
        <div className="dw-zone__inner dw-final__inner">
          <h2 className="dw-final__title">See it fail. Then see it survive.</h2>

          <div className="dw-final__actions">
            <div className="dw-terminal">
              <div className="dw-terminal__bar" aria-hidden="true">
                <span className="dw-terminal__dot" />
                <span className="dw-terminal__dot" />
                <span className="dw-terminal__dot" />
              </div>
              <div className="dw-terminal__body">
                <div>
                  <span className="dw-terminal__prompt">$</span> docker compose up -d
                </div>
                <div>
                  <span className="dw-terminal__prompt">$</span> pnpm seed
                </div>
                <div>
                  <span className="dw-terminal__prompt">$</span> pnpm dev
                </div>
              </div>
            </div>
            <Link href="/reverify" className="dw-cta-primary">
              Run the live demo
            </Link>
            <a href="#architecture" className="dw-cta-secondary">
              Read the architecture
            </a>
          </div>
        </div>
      </section>

      <footer className="dw-zone dw-footer" style={{ '--rule-delay': '660ms' } as React.CSSProperties}>
        <span className="dw-footer__brand">ARKA</span>
        <span>Team True Node &middot; NSBM Green University &middot; Duothan 6.0 &middot; MIT License</span>
        <a href="https://github.com/agentdynarq/arka" target="_blank" rel="noopener noreferrer">
          github.com/agentdynarq/arka
        </a>
      </footer>
    </div>
  )
}
