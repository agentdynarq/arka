import Link from 'next/link'
import { SplitHero } from '@arka/ui'

const DOCTRINES = [
  {
    title: 'Assume breach',
    body: 'Every service-to-service call carries a short-lived workload identity. A process that cannot prove what it is talks to nothing, so one foothold never becomes lateral movement.',
  },
  {
    title: 'Contain by construction',
    body: 'Customers are sharded across independent Cells that share nothing and have no network path to each other. A compromise is capped at one Cell while every other Cell keeps serving, unaware anything happened.',
  },
  {
    title: 'Recovery is a feature',
    body: 'The ledger is an append-only chain of double-entry records, each block carrying the hash of its predecessor. Tampering is detectable by mathematics. There is no Master Key: root recovery needs a 3-of-5 quorum.',
  },
]

const BULLETS = DOCTRINES.map((d) => ({ title: d.title, description: d.body }))

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

      <section className="landing-section">
        <div className="landing-section__inner">
          <p className="landing-section__label">The problem</p>
          <p className="landing-prose">
            Backups protect data. They do not protect a bank&rsquo;s ability to keep operating once one
            compromised service can reach every other service. The 2065 scenario&rsquo;s real failure was
            structural: <strong>a single trust domain</strong> meant one breach anywhere was a breach
            everywhere, and a single Master Key meant recovery itself depended on the one artifact an
            attacker most wanted.
          </p>
          <p className="landing-prose">
            Arka is the rebuild. Blast radius stops being a matter of luck and becomes a design parameter,
            set at build time, not discovered during an incident. A Cell is configuration, not code: there
            is exactly one copy of each service, and adding a third Cell is an environment change, never a
            code change.
          </p>
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-section__inner">
          <p className="landing-section__label">Three doctrines</p>
          <div className="landing-doctrine-list">
            {DOCTRINES.map((d, i) => (
              <div className="landing-doctrine" key={d.title}>
                <span className="landing-doctrine__index">{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <h2 className="landing-doctrine__title">{d.title}</h2>
                  <p className="landing-doctrine__body">{d.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section" style={{ borderBottom: 'none' }}>
        <div className="landing-section__inner">
          <p className="landing-section__label">Nothing here is a mockup</p>
          <div className="landing-terminal">
            <div className="landing-terminal__bar">
              <span className="landing-terminal__dot" />
              <span className="landing-terminal__dot" />
              <span className="landing-terminal__dot" />
            </div>
            <div className="landing-terminal__body">
              <div className="landing-terminal__line">
                <span className="landing-terminal__prompt">$</span> pnpm verify-ledger
              </div>
              <div className="landing-terminal__result">walks every block, prints the chain and any break, real hash chain, not a claim</div>
              <div className="landing-terminal__line" style={{ marginTop: '12px' }}>
                <span className="landing-terminal__prompt">$</span> pnpm test
              </div>
              <div className="landing-terminal__result">
                concurrent-race tests fire ten simultaneous requests at a real Postgres and assert exactly
                one wins
              </div>
              <div className="landing-terminal__line" style={{ marginTop: '12px' }}>
                <span className="landing-terminal__prompt">$</span> grep livenessSimulated
              </div>
              <div className="landing-terminal__result">the one simulated step says so in the response itself, not buried in a comment</div>
            </div>
          </div>
        </div>
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
