import type { Metadata } from 'next'
import '@arka/ui/tokens.css'
import '@arka/ui/components.css'
import './globals.css'
import { Shell } from '@arka/ui'
import { AppTopbar } from '@/components/AppTopbar'

export const metadata: Metadata = {
  title: 'Arka',
  description: 'Banking that survives.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Shell>
          <AppTopbar />
          {children}
        </Shell>
      </body>
    </html>
  )
}
