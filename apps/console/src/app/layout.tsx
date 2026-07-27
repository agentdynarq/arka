import type { Metadata } from 'next'
import '@arka/ui/tokens.css'
import '@arka/ui/components.css'
import './globals.css'
import { Shell } from '@arka/ui'
import { ConsoleTopbar } from '@/components/ConsoleTopbar'

export const metadata: Metadata = {
  title: 'Arka Recovery Console',
  description: 'Operator control plane. Health map, quarantine, integrity audit, audit trail.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The console is an operator instrument panel, a deliberately distinct
    // register from the customer app: `data-surface="ops"` opts every screen
    // here into @arka/ui's darker token set, see packages/ui/README.md.
    <html lang="en" data-surface="ops">
      <body>
        <Shell>
          <ConsoleTopbar />
          {children}
        </Shell>
      </body>
    </html>
  )
}
