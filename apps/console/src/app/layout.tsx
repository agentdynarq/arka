import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Arka Recovery Console',
  description: 'Operator control plane. Health map, quarantine, integrity audit, audit trail.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="console-nav">
          <a href="/health-map">Health map (W5)</a>
          <a href="/integrity">Integrity audit (W6)</a>
        </nav>
        {children}
      </body>
    </html>
  )
}
