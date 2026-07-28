import type { Metadata } from 'next'
import { Space_Grotesk, Inter, JetBrains_Mono } from 'next/font/google'
import '@arka/ui/tokens.css'
import '@arka/ui/components.css'
import './globals.css'
import { Shell } from '@arka/ui'
import { AppTopbar } from '@/components/AppTopbar'

const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], weight: ['500', '700'], variable: '--font-space-grotesk' })
const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-inter' })
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], weight: ['400'], variable: '--font-jetbrains-mono' })

export const metadata: Metadata = {
  title: 'Arka',
  description: 'Banking that survives.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <Shell>
          <AppTopbar />
          {children}
        </Shell>
      </body>
    </html>
  )
}
