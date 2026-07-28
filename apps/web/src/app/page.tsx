import Link from 'next/link'
import Image from 'next/image'
import { ScrollReveal } from '@/components/ScrollReveal'

export default function Home() {
  return (
    <div className="commit-layout">
      <aside className="commit-aside">
        <div className="commit-aside__top">
          <span className="commit-aside__brand">
            <span className="commit-aside__mark" aria-hidden="true">
              A
            </span>
            ARKA
          </span>
        </div>

        <div className="commit-aside__body">
          <h1 className="commit-aside__headline">
            Banking that survives, <span>not by luck.</span>
          </h1>
          <p className="commit-aside__lede">
            The 2065 collapse was an architecture failure: one trust domain, one Master Key, one breach was
            every breach. Arka is the rebuild, a cell-isolated platform where a compromise is capped at one
            Cell by construction.
          </p>
          <div className="commit-aside__actions">
            <Link href="/reverify" className="commit-aside__cta">
              Enter the live demo
            </Link>
            <a href="https://github.com/agentdynarq/arka" className="commit-aside__secondary" target="_blank" rel="noreferrer">
              View source
            </a>
          </div>
          <p className="commit-aside__credentials">alice / demo-password-123 · MFA code printed to the server console on boot</p>

          <div className="commit-aside__footer">
            <a href="https://github.com/agentdynarq/arka" target="_blank" rel="noreferrer">
              GitHub
            </a>
            <a href="https://github.com/agentdynarq/arka/blob/main/USER-GUIDE.md" target="_blank" rel="noreferrer">
              User guide
            </a>
            <span>Team True Node · Duothan 6.0</span>
          </div>
        </div>
      </aside>

      <div className="commit-main">
        <nav className="commit-nav">
          <Link href="/reverify" className="commit-nav__link">
            Sign in →
          </Link>
        </nav>

        <div className="commit-intro">
          <p className="commit-intro__label">What we had, what we built</p>
          <h2 className="commit-intro__title">Not a pitch. The actual build, in order, proven live at every step.</h2>
        </div>

        <ScrollReveal>
          <article className="commit-entry commit-entry--danger">
            <span className="commit-entry__date">2065</span>
            <div className="commit-entry__media">
              <Image
                src="/media/architecture.gif"
                alt="Animated diagram: the 2065 collapse spreading through one undivided trust domain, versus the same attack today staying contained inside one Cell while Cell 2 keeps serving"
                width={1200}
                height={640}
                unoptimized
              />
            </div>
            <p className="commit-entry__caption">
              An animated architecture diagram, not a screen recording: how it failed then, how Arka contains
              the same attack now.
            </p>
            <h3 className="commit-entry__title">One trust domain. One Master Key. One breach was every breach.</h3>
            <p className="commit-entry__body">
              Backups protect data. They do not protect a bank&rsquo;s ability to keep operating once one
              compromised service can reach every other service. <strong>A single trust domain</strong> meant
              one foothold anywhere was total compromise everywhere, and a single Master Key meant recovery
              itself depended on the one artifact an attacker most wanted.
            </p>
          </article>
        </ScrollReveal>

        <ScrollReveal>
          <article className="commit-entry">
            <span className="commit-entry__date">26 Jul</span>
            <h3 className="commit-entry__title">A ledger that cannot lie, before anything else exists.</h3>
            <p className="commit-entry__body">
              <code>ledger-core</code> first: append-only, hash-chained, double-entry, zero runtime
              dependencies. Every later service builds on this. Tampering is detectable by mathematics, not
              by trust, and the chain is walked from genesis every time, never from a checkpoint that could
              itself have been forged.
            </p>
            <ul className="commit-entry__list">
              <li>71 tests passing before a single service existed</li>
              <li>bigint minor units throughout, no float ever touches money</li>
            </ul>
          </article>
        </ScrollReveal>

        <ScrollReveal>
          <article className="commit-entry">
            <span className="commit-entry__date">27 Jul</span>
            <div className="commit-entry__media">
              <Image
                src="/media/isolation.gif"
                alt="Terminal recording: docker exec ping from Cell 1's container to Cell 2's fails on DNS resolution, then pnpm verify-ledger walks both Cells' real hash chains clean"
                width={897}
                height={605}
                unoptimized
              />
            </div>
            <p className="commit-entry__caption">Real terminal output. `docker exec ... ping` really fails. `verify-ledger` really walks the chain.</p>
            <h3 className="commit-entry__title">Two Cells. No shared network. Provable, not asserted.</h3>
            <p className="commit-entry__body">
              The Gateway pins each customer to a Cell by stable hash. Cell 1 holds no credential that
              reaches Cell 2, because there is no route between them at all, not a firewall rule sitting on
              top of a real connection.
            </p>
          </article>
        </ScrollReveal>

        <ScrollReveal>
          <article className="commit-entry">
            <span className="commit-entry__date">28 Jul</span>
            <h3 className="commit-entry__title">Argon2, TOTP, step-up. A 15% mark bucket on its own.</h3>
            <p className="commit-entry__body">
              A seeded customer re-verifies, passes MFA, and reaches a real dashboard sourced live from the
              ledger, not a fixture.
            </p>
            <ul className="commit-entry__list">
              <li>Sessions with refresh rotation, a reused token revokes the whole family</li>
              <li>Step-up confirmation on a new payee, not just a password</li>
              <li>Login rate limiting and account lockout, proven under real concurrency</li>
            </ul>
          </article>
        </ScrollReveal>

        <ScrollReveal>
          <article className="commit-entry">
            <span className="commit-entry__date">29–30 Jul</span>
            <h3 className="commit-entry__title">QR acceptance, daily limits, agent cash-in. One atomic append each.</h3>
            <p className="commit-entry__body">
              No saga anywhere, because nothing in this build&rsquo;s real scope ever needed one: every
              money-movement path reduces to a single ledger append, and idempotency means a retried payment
              never executes twice.
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
          <article className="commit-entry">
            <span className="commit-entry__date">FR-22</span>
            <div className="commit-entry__media">
              <Image
                src="/media/quarantine.gif"
                alt="Terminal recording of the real HTTP traffic: a transfer succeeds, two operators quarantine Cell 1 under dual approval, the identical transfer is rejected 403 CELL_QUARANTINED, a dashboard read still succeeds, the quarantine is lifted, and the transfer succeeds again"
                width={1100}
                height={640}
                unoptimized
              />
            </div>
            <p className="commit-entry__caption">The real HTTP traffic, recorded live against the running stack. No staging.</p>
            <h3 className="commit-entry__title">A real incident. Not a diagram this time.</h3>
            <p className="commit-entry__body">
              Two operators quarantine Cell 1 under dual approval, neither alone. The identical transfer that
              succeeded a moment earlier is now rejected <strong>403 CELL_QUARANTINED</strong>. Reads still
              work: read-only, not down. Cell 2 never notices. Lift the quarantine, the transfer succeeds
              again.
            </p>
          </article>
        </ScrollReveal>

        <section className="commit-cta">
          <h2 className="commit-cta__title">Sign in as alice and watch it work.</h2>
          <p className="commit-cta__sub">Blast radius stops being luck. It becomes a design parameter.</p>
          <Link href="/reverify" className="commit-cta__action">
            Enter the live demo
          </Link>
        </section>

        <footer className="commit-footer">
          <span>Arka · built for Duothan 6.0, NSBM Green University · </span>
          <a href="https://github.com/agentdynarq/arka" target="_blank" rel="noreferrer">
            github.com/agentdynarq/arka
          </a>
        </footer>
      </div>
    </div>
  )
}
