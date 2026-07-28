import Link from 'next/link'
import Image from 'next/image'
import { SplitHero } from '@arka/ui'
import { ScrollReveal } from '@/components/ScrollReveal'

const BULLETS = [
  { title: 'Assume breach', description: 'A process that cannot prove what it is talks to nothing.' },
  { title: 'Contain by construction', description: 'A compromise is capped at one Cell. No exceptions.' },
  { title: 'Recovery is a feature', description: 'No Master Key. Root recovery needs a 3-of-5 quorum.' },
]

export default function Home() {
  return (
    <>
      <nav className="landing-nav">
        <span className="landing-nav__brand">ARKA</span>
        <Link href="/reverify" className="landing-nav__link">
          Sign in →
        </Link>
      </nav>

      <SplitHero
        tagline="Banking that survives."
        headline="The 2065 collapse was an architecture failure, not a security one."
        bullets={BULLETS}
        footer="ARKA · CELL-ISOLATED BANKING PLATFORM"
      >
        <div className="landing-diagram">
          <div className="landing-diagram__gateway">API Gateway · Cell Router</div>
          <div className="landing-diagram__drop" />
          <div className="landing-diagram__cells">
            <div className="landing-diagram__cell">
              <div className="landing-diagram__cell-title">Cell 1</div>
              <div className="landing-diagram__cell-services">Identity → Accounts → Payments → Ledger</div>
              <div className="landing-diagram__cell-store">Own Postgres · own Redis Streams</div>
            </div>
            <div className="landing-diagram__no-route" aria-label="no route exists" />
            <div className="landing-diagram__cell">
              <div className="landing-diagram__cell-title">Cell 2</div>
              <div className="landing-diagram__cell-services">Identity → Accounts → Payments → Ledger</div>
              <div className="landing-diagram__cell-store">Own Postgres · own Redis Streams</div>
            </div>
          </div>
          <p className="landing-diagram__caption">
            No route between Cells. Not a firewall rule, a missing wire. The control plane observes and
            rebuilds through a one-way channel and holds no customer data.
          </p>
          <div className="landing-hero-actions">
            <Link href="/reverify" className="landing-hero-actions__primary">
              Enter the live demo
            </Link>
            <a href="https://github.com/agentdynarq/arka" className="landing-hero-actions__secondary" target="_blank" rel="noreferrer">
              View source
            </a>
          </div>
          <p className="landing-hero-credentials">alice / demo-password-123 · MFA code printed to the server console on boot</p>
        </div>
      </SplitHero>

      <section className="timeline-section">
        <ScrollReveal className="timeline-intro">
          <p className="timeline-intro__label">What we had, what we built</p>
          <h2 className="timeline-intro__title">Not a pitch. The actual build, in order, proven live at every step.</h2>
        </ScrollReveal>

        <div className="timeline">
          <ScrollReveal>
            <article className="timeline-entry timeline-entry--danger">
              <span className="timeline-entry__marker" aria-hidden="true" />
              <p className="timeline-entry__stage">2065 · what we had</p>
              <h3 className="timeline-entry__title">One trust domain. One Master Key. One breach was every breach.</h3>
              <p className="timeline-entry__body">
                Backups protect data. They do not protect a bank&rsquo;s ability to keep operating once one
                compromised service can reach every other service. <strong>A single trust domain</strong>{' '}
                meant one foothold anywhere was total compromise everywhere, and a single Master Key meant
                recovery itself depended on the one artifact an attacker most wanted.
              </p>
              <div className="timeline-entry__media">
                <Image
                  src="/media/architecture.gif"
                  alt="Animated diagram: the 2065 collapse spreading through one undivided trust domain, versus the same attack today staying contained inside one Cell while Cell 2 keeps serving"
                  width={1200}
                  height={640}
                  unoptimized
                />
              </div>
              <p className="timeline-entry__caption">
                An animated architecture diagram, not a screen recording: how it failed then, how Arka
                contains the same attack now.
              </p>
            </article>
          </ScrollReveal>

          <ScrollReveal>
            <article className="timeline-entry">
              <span className="timeline-entry__marker" aria-hidden="true" />
              <p className="timeline-entry__stage">26 Jul · day one</p>
              <h3 className="timeline-entry__title">A ledger that cannot lie, before anything else exists.</h3>
              <p className="timeline-entry__body">
                <code>ledger-core</code> first: append-only, hash-chained, double-entry, zero runtime
                dependencies. Every later service builds on this. Tampering is detectable by mathematics,
                not by trust, and the chain is walked from genesis every time, never from a checkpoint that
                could itself have been forged.
              </p>
            </article>
          </ScrollReveal>

          <ScrollReveal>
            <article className="timeline-entry">
              <span className="timeline-entry__marker" aria-hidden="true" />
              <p className="timeline-entry__stage">27 Jul · Cells get a router</p>
              <h3 className="timeline-entry__title">Two Cells. No shared network. Provable, not asserted.</h3>
              <p className="timeline-entry__body">
                The Gateway pins each customer to a Cell by stable hash. Cell 1 holds no credential that
                reaches Cell 2, because there is no route between them at all, not a firewall rule sitting
                on top of a real connection.
              </p>
              <div className="timeline-entry__media">
                <Image
                  src="/media/isolation.gif"
                  alt="Terminal recording: docker exec ping from Cell 1's container to Cell 2's fails on DNS resolution, then pnpm verify-ledger walks both Cells' real hash chains clean"
                  width={897}
                  height={605}
                  unoptimized
                />
              </div>
              <p className="timeline-entry__caption">Real terminal output. `docker exec ... ping` really fails. `verify-ledger` really walks the chain.</p>
            </article>
          </ScrollReveal>

          <ScrollReveal>
            <article className="timeline-entry">
              <span className="timeline-entry__marker" aria-hidden="true" />
              <p className="timeline-entry__stage">28 Jul · identity in depth</p>
              <h3 className="timeline-entry__title">Argon2, TOTP, step-up. A 15% mark bucket on its own.</h3>
              <p className="timeline-entry__body">
                Sessions with refresh rotation, a reused token revokes the whole family. Step-up on a new
                payee, not just a password. A seeded customer re-verifies, passes MFA, and reaches a real
                dashboard sourced live from the ledger, not a fixture.
              </p>
            </article>
          </ScrollReveal>

          <ScrollReveal>
            <article className="timeline-entry">
              <span className="timeline-entry__marker" aria-hidden="true" />
              <p className="timeline-entry__stage">29 to 30 Jul · money moves, safely</p>
              <h3 className="timeline-entry__title">QR acceptance, daily limits, agent cash-in. One atomic append each.</h3>
              <p className="timeline-entry__body">
                No saga anywhere, because nothing in this build&rsquo;s real scope ever needed one: every
                money-movement path reduces to a single ledger append, and idempotency means a retried
                payment never executes twice.
              </p>
              <div className="landing-terminal">
                <div className="landing-terminal__bar">
                  <span className="landing-terminal__dot" />
                  <span className="landing-terminal__dot" />
                  <span className="landing-terminal__dot" />
                </div>
                <div className="landing-terminal__body">
                  <div className="landing-terminal__line">
                    <span className="landing-terminal__prompt">$</span> pnpm test
                  </div>
                  <div className="landing-terminal__result">
                    concurrent-race tests fire ten simultaneous requests at a real Postgres, exactly one wins
                  </div>
                </div>
              </div>
            </article>
          </ScrollReveal>

          <ScrollReveal>
            <article className="timeline-entry">
              <span className="timeline-entry__marker" aria-hidden="true" />
              <p className="timeline-entry__stage">FR-22 · contained, live</p>
              <h3 className="timeline-entry__title">A real incident. Not a diagram this time.</h3>
              <p className="timeline-entry__body">
                Two operators quarantine Cell 1 under dual approval, neither alone. The identical transfer
                that succeeded a moment earlier is now rejected <strong>403 CELL_QUARANTINED</strong>. Reads
                still work: read-only, not down. Cell 2 never notices. Lift the quarantine, the transfer
                succeeds again.
              </p>
              <div className="timeline-entry__media">
                <Image
                  src="/media/quarantine.gif"
                  alt="Terminal recording of the real HTTP traffic: a transfer succeeds, two operators quarantine Cell 1 under dual approval, the identical transfer is rejected 403 CELL_QUARANTINED, a dashboard read still succeeds, the quarantine is lifted, and the transfer succeeds again"
                  width={1100}
                  height={640}
                  unoptimized
                />
              </div>
              <p className="timeline-entry__caption">The real HTTP traffic, recorded live against the running stack. No staging.</p>
            </article>
          </ScrollReveal>
        </div>
      </section>

      <section className="landing-cta">
        <ScrollReveal>
          <h2 className="landing-cta__title">Sign in as alice and watch it work.</h2>
          <p className="landing-cta__sub">Blast radius stops being luck. It becomes a design parameter.</p>
          <div className="landing-cta__actions">
            <Link href="/reverify" className="landing-cta__primary">
              Enter the live demo
            </Link>
          </div>
        </ScrollReveal>
      </section>

      <footer className="landing-footer">
        <span>Arka · built for Duothan 6.0, NSBM Green University</span>
        <a href="https://github.com/agentdynarq/arka" target="_blank" rel="noreferrer">
          github.com/agentdynarq/arka
        </a>
      </footer>
    </>
  )
}
