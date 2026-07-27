import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Arka Recovery Console',
  description: 'Operator control plane. Health map, quarantine, audit trail.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
