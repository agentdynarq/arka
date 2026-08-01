import Link from 'next/link'

/**
 * Reference card for Duothan 6.0 judges, not a second homepage. Pure Server
 * Component: no "use client", no state, no fetch. Every command, port,
 * credential, and file size here is real — pulled from README.md,
 * docs/RUNBOOK.md, apps/identity/README.md, and the actual files in
 * apps/web/public/media/. No aspirational content: if a step doesn't work
 * today, it isn't listed.
 *
 * No longer loads Source Serif 4 itself (chore/indigo-tokens): it's loaded
 * app-wide now in apps/web/src/app/layout.tsx, so --font-serif in
 * globals.css already resolves correctly here by inheritance, no
 * second-fetch scoped call needed.
 */

export default function JudgesPage() {
  return (
    <div className="dw">
      <nav className="dw-nav" aria-label="Primary">
        <div className="dw-nav__inner">
          <Link href="/" className="dw-nav__brand" style={{ textDecoration: 'none' }}>
            ARKA
          </Link>
          <div className="dw-nav__actions">
            <Link href="/" className="dw-nav__secondary">
              Back to the homepage
            </Link>
          </div>
        </div>
      </nav>

      <header className="dw-zone dw-hero" style={{ paddingBottom: 0 }}>
        <div className="dw-zone__inner dw-section" style={{ paddingBottom: 'var(--s5)' }}>
          <span className="dw-eyebrow">Judges &middot; reference card</span>
          <h1 className="dw-hero__claim" style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.6rem)' }}>
            Arka, for the panel.
          </h1>
          <p className="dw-hero__sub">
            Every command below is copy-pasteable and every number is real. Full argument and honest-scope
            list are on <a href="/#scope">the homepage</a>.
          </p>
        </div>
      </header>

      {/* 1. Five-minute path */}
      <section className="dw-zone" style={{ '--rule-delay': '0ms' } as React.CSSProperties}>
        <div className="dw-zone__inner dw-section">
          <span className="dw-eyebrow">01 &middot; The five-minute path</span>
          <h2 className="dw-heading dw-heading--lg">Start here.</h2>
          <ol className="dw-scope__list" style={{ columns: 1, maxWidth: '62ch' }}>
            <li className="dw-scope__item">
              <strong>Bring the stack up</strong> &mdash; run the four startup commands below, wait for
              &ldquo;ready&rdquo;.
            </li>
            <li className="dw-scope__item">
              <strong>Log in as alice</strong> at <code>/reverify</code>, get the MFA code (two ways, below),
              reach the dashboard.
            </li>
            <li className="dw-scope__item">
              <strong>Run a transfer</strong> from the dashboard, watch the balance and history update. If
              the very first attempt within ~20 seconds of a fresh boot returns{' '}
              <code>503 QUARANTINE_CHECK_UNAVAILABLE</code>, that&rsquo;s a cold-start race between two
              services, not a broken quarantine check &mdash; wait a moment and retry, it clears itself.
            </li>
            <li className="dw-scope__item">
              <strong>Open the Recovery Console health map</strong>, confirm both Cells show healthy.
            </li>
            <li className="dw-scope__item">
              <strong>Quarantine Cell 1</strong> under dual approval (two tabs, two operator IDs), then
              retry the transfer &mdash; it&rsquo;s rejected, read-only, Cell 2 unaffected.
            </li>
            <li className="dw-scope__item">
              <strong>Lift the quarantine</strong> the same way, then run <code>pnpm verify-ledger</code> and
              read the root hash yourself.
            </li>
          </ol>
        </div>
      </section>

      {/* 2. Startup commands */}
      <section className="dw-zone" style={{ '--rule-delay': '60ms' } as React.CSSProperties}>
        <div className="dw-zone__inner dw-section">
          <span className="dw-eyebrow">02 &middot; Startup</span>
          <h2 className="dw-heading dw-heading--lg">In order, from the repo root.</h2>
          <div className="dw-plate" style={{ marginTop: 'var(--s6)' }}>
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
                <div style={{ color: 'var(--plate-ink-soft)' }}>
                  &nbsp;&nbsp;Postgres + Redis for both Cells and the control plane. Does NOT start the app
                  services below &mdash; those run via pnpm. ~10&ndash;15s.
                </div>
                <br />
                <div>
                  <span className="dw-terminal__prompt">$</span> pnpm seed
                </div>
                <div style={{ color: 'var(--plate-ink-soft)' }}>&nbsp;&nbsp;Deterministic demo data, both Cells. A few seconds.</div>
                <br />
                <div>
                  <span className="dw-terminal__prompt">$</span> pnpm dev
                </div>
                <div style={{ color: 'var(--plate-ink-soft)' }}>
                  &nbsp;&nbsp;Starts all five app processes in parallel (turbo). Ready when you see &ldquo;identity
                  listening on :3001&rdquo;, &ldquo;gateway listening on :8080&rdquo;, and Next&rsquo;s
                  &ldquo;Ready&rdquo; lines for web and console. ~15&ndash;30s.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Surfaces table */}
      <section className="dw-zone" style={{ '--rule-delay': '120ms' } as React.CSSProperties}>
        <div className="dw-zone__inner dw-section">
          <span className="dw-eyebrow">03 &middot; Every surface</span>
          <h2 className="dw-heading dw-heading--lg">Real ports, real purpose.</h2>
          <div className="dw-spec" style={{ marginTop: 'var(--s6)' }}>
            <div className="dw-spec__row">
              <span className="dw-spec__k">
                <a href="http://localhost:3000" target="_blank" rel="noopener noreferrer">
                  localhost:3000
                </a>
              </span>
              <span className="dw-spec__v">
                Marketing site (this page and the homepage) AND the customer app &mdash; same Next.js
                process, same port. Re-verify at <code>/reverify</code>, dashboard, transfer, agent
                cash-in/out, QR. For a depositor.
              </span>
            </div>
            <div className="dw-spec__row">
              <span className="dw-spec__k">
                <a href="http://localhost:3300" target="_blank" rel="noopener noreferrer">
                  localhost:3300
                </a>
              </span>
              <span className="dw-spec__v">
                Recovery Console. Cell health map + dual-approval quarantine (<code>/health-map</code>),
                integrity audit (<code>/integrity</code>). For a bank operator.
              </span>
            </div>
            <div className="dw-spec__row">
              <span className="dw-spec__k">localhost:8080</span>
              <span className="dw-spec__v">
                API gateway. TLS/OIDC + MFA + the Cell Router in front of both Cells. No UI &mdash; backend
                only, the one component that knows more than one Cell exists.
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Credentials */}
      <section className="dw-zone dw-zone--tint" style={{ '--rule-delay': '180ms' } as React.CSSProperties}>
        <div className="dw-zone__inner dw-section">
          <span className="dw-eyebrow">04 &middot; Credentials</span>
          <h2 className="dw-heading dw-heading--lg">What to log in with.</h2>
          <div className="dw-spec" style={{ marginTop: 'var(--s6)' }}>
            <div className="dw-spec__row">
              <span className="dw-spec__k">Cell 1 customer</span>
              <span className="dw-spec__v">
                <code>alice</code> / <code>demo-password-123</code>. Re-verify with customerId{' '}
                <code>cust-alice</code>, registryDocumentId <code>DOC-ALICE-001</code>.
              </span>
            </div>
            <div className="dw-spec__row">
              <span className="dw-spec__k">Cell 2 customer</span>
              <span className="dw-spec__v">
                <code>chandi</code> / <code>demo-password-123</code>, seeded by <code>pnpm seed</code> into
                Cell 2. Re-verify with customerId <code>cust-chandi</code>, registryDocumentId{' '}
                <code>DOC-CHANDI-001</code>. Logging in as chandi needs a second{' '}
                <code>apps/identity</code> instance pointed at Cell 2 (<code>CELL_ID=cell-2</code>, its own{' '}
                <code>DATABASE_URL</code> and <code>IDENTITY_PORT</code> &mdash; see{' '}
                <code>apps/identity/README.md</code>), which plain <code>pnpm dev</code> does not start;
                without it this login returns <code>401 INVALID_CREDENTIALS</code>. To see Cell 2 keep
                serving while Cell 1 is quarantined, use the health map and integrity audit instead &mdash;
                both Cells are visible there without a second instance.
              </span>
            </div>
            <div className="dw-spec__row">
              <span className="dw-spec__k">Operator ID</span>
              <span className="dw-spec__v">
                Free text on the health map, default <code>operator-1</code> &mdash; there is no operator
                login in this scope. For dual approval, open two browser tabs and type two different
                values (e.g. <code>operator-1</code> and <code>operator-2</code>), one action per tab.
              </span>
            </div>
            <div className="dw-spec__row">
              <span className="dw-spec__k">MFA code, two ways</span>
              <span className="dw-spec__v">
                In-app: the phone-icon widget on the re-verify screen&rsquo;s MFA step. From a terminal: the
                identity server prints a fresh valid code to its console once, at boot &mdash; look for a
                line starting &ldquo;[DEMO MODE] Current TOTP code:&rdquo; in the <code>pnpm dev</code>{' '}
                output (turbo prefixes it <code>@arka/identity-app:dev</code>). Restart that one process to
                print a new code if 30 seconds have passed.
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 5. What to look at */}
      <section className="dw-zone" style={{ '--rule-delay': '240ms' } as React.CSSProperties}>
        <div className="dw-zone__inner dw-section">
          <span className="dw-eyebrow">05 &middot; Where to look</span>
          <h2 className="dw-heading dw-heading--lg">Exact paths.</h2>
          <div className="dw-spec" style={{ marginTop: 'var(--s6)' }}>
            <div className="dw-spec__row">
              <span className="dw-spec__k">The argument</span>
              <span className="dw-spec__v">
                <a href="/#architecture">localhost:3000/#architecture</a> &mdash; the Cell topology, the void
                animation, the ledger spine filling.
              </span>
            </div>
            <div className="dw-spec__row">
              <span className="dw-spec__k">Containment, live</span>
              <span className="dw-spec__v">
                <a href="http://localhost:3300/health-map" target="_blank" rel="noopener noreferrer">
                  localhost:3300/health-map
                </a>{' '}
                &mdash; request quarantine, approve from a second tab, watch Cell 1 flip read-only while
                Cell 2 stays green.
              </span>
            </div>
            <div className="dw-spec__row">
              <span className="dw-spec__k">Tamper evidence</span>
              <span className="dw-spec__v">
                <a href="http://localhost:3300/integrity" target="_blank" rel="noopener noreferrer">
                  localhost:3300/integrity
                </a>{' '}
                &mdash; walk the hash chain block by block.
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Recorded evidence */}
      <section className="dw-zone" style={{ '--rule-delay': '300ms' } as React.CSSProperties}>
        <div className="dw-zone__inner dw-section">
          <span className="dw-eyebrow">06 &middot; Recorded evidence</span>
          <h2 className="dw-heading dw-heading--lg">If the stack isn&rsquo;t up.</h2>
          <div className="dw-proof__links" style={{ marginTop: 'var(--s6)' }}>
            <a href="/media/isolation.gif" className="dw-proof__link" target="_blank" rel="noopener noreferrer">
              See the isolation proof &rarr;{' '}
              <span className="dw-proof__link-size">isolation.gif &middot; 132KB, recorded terminal capture</span>
            </a>
            <a href="/media/quarantine.gif" className="dw-proof__link" target="_blank" rel="noopener noreferrer">
              Watch the quarantine, unstaged &rarr;{' '}
              <span className="dw-proof__link-size">quarantine.gif &middot; 781KB, recorded terminal capture</span>
            </a>
          </div>
        </div>
      </section>

      {/* 7. Verify it yourself */}
      <section className="dw-zone" style={{ '--rule-delay': '360ms' } as React.CSSProperties}>
        <div className="dw-zone__inner dw-section">
          <span className="dw-eyebrow">07 &middot; Verify it yourself</span>
          <h2 className="dw-heading dw-heading--lg">Don&rsquo;t trust this page.</h2>
          <div className="dw-plate" style={{ marginTop: 'var(--s6)' }}>
            <div className="dw-terminal">
              <div className="dw-terminal__bar" aria-hidden="true">
                <span className="dw-terminal__dot" />
                <span className="dw-terminal__dot" />
                <span className="dw-terminal__dot" />
              </div>
              <div className="dw-terminal__body">
                <span className="dw-terminal__prompt">$</span> pnpm verify-ledger
              </div>
            </div>
          </div>
          <p className="dw-caption">
            Walks the hash chain block by block and recomputes it. An auditor never has to trust this page,
            or any dashboard &mdash; recompute independently.
          </p>
        </div>
      </section>

      {/* 8. Link to honest scope */}
      <section className="dw-zone" style={{ '--rule-delay': '420ms' } as React.CSSProperties}>
        <div className="dw-zone__inner dw-section dw-section--tight">
          <span className="dw-eyebrow">08 &middot; What isn&rsquo;t built yet</span>
          <p className="dw-body dw-body--tight">
            Named, not hidden, on the homepage&rsquo;s honest-scope section: <a href="/#scope">/#scope</a>.
          </p>
        </div>
      </section>

      {/* 9. Team */}
      <footer className="dw-zone dw-footer">
        <span className="dw-footer__brand">ARKA</span>
        <span>
          R M S Hasitha Bandara (36941) &middot; W A S Keshan (36689) &middot; NSBM Green University &middot;
          Duothan 6.0, Phase 2
        </span>
      </footer>
    </div>
  )
}
