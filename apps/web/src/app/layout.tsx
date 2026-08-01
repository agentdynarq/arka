import type { Metadata } from 'next'
import { Source_Serif_4, Inter, JetBrains_Mono } from 'next/font/google'
import '@arka/ui/tokens.css'
import '@arka/ui/components.css'
import './globals.css'
import { AppShell } from '@/components/AppSidebar'

// Space Grotesk removed (chore/indigo-tokens): headings are Source Serif 4
// everywhere now, loaded here app-wide rather than scoped per-route the way
// page.tsx and judges/page.tsx each still load their own instance today.
const sourceSerif = Source_Serif_4({ subsets: ['latin'], weight: ['400', '600'], variable: '--font-source-serif' })
const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-inter' })
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], weight: ['400'], variable: '--font-jetbrains-mono' })

export const metadata: Metadata = {
  title: 'Arka',
  description: 'A cell-isolated digital banking platform. One Cell compromised, zero customers lost.',
  openGraph: {
    title: 'Arka',
    description: 'A cell-isolated digital banking platform. One Cell compromised, zero customers lost.',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sourceSerif.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
