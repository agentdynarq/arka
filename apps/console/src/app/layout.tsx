import type { Metadata } from 'next'
import { Source_Serif_4, Inter, JetBrains_Mono } from 'next/font/google'
import '@arka/ui/tokens.css'
import '@arka/ui/components.css'
import './globals.css'
import { ConsoleShell } from '@/components/ConsoleSidebar'

// Not previously wired here (chore/indigo-tokens): apps/web already loaded
// these three, apps/console never did, silently falling back to system
// fonts. Added now since headings are Source Serif 4 everywhere as of this
// pass, and the ops register no longer has a reason to differ from the
// customer app's own font loading either.
const sourceSerif = Source_Serif_4({ subsets: ['latin'], weight: ['400', '600'], variable: '--font-source-serif' })
const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-inter' })
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], weight: ['400'], variable: '--font-jetbrains-mono' })

export const metadata: Metadata = {
  title: 'Arka Recovery Console',
  description: 'Operator control plane. Health map, quarantine, integrity audit, audit trail.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The console still opts into @arka/ui's `data-surface="ops"` register,
    // but as of chore/indigo-tokens that register is light, the same family
    // as the customer app and the homepage, kept as a distinct attribute
    // rather than removed, so a genuinely dark register could still be
    // reintroduced through this same seam if one is ever needed again.
    <html lang="en" data-surface="ops" className={`${sourceSerif.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <ConsoleShell>{children}</ConsoleShell>
      </body>
    </html>
  )
}
