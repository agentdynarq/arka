'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { fetchCellStatus } from '@/lib/api'
import type { CellStatus } from '@/lib/api'
import { getAccessToken } from '@/lib/session'

const CellStatusContext = createContext<CellStatus | null>(null)

/**
 * Polls GET /v1/me/cell-status every 5 seconds, the same cadence W5's health
 * map already uses, and makes the result available to both the sidebar's
 * Cell status element and W3's quarantine notice without either one polling
 * on its own. `null` until the first response lands, distinct from
 * `{ status: 'unknown' }` (a completed check that could not tell): callers
 * treat both as "not yet known enough to show a definite state".
 */
export function CellStatusProvider({ signedIn, children }: { readonly signedIn: boolean; readonly children: ReactNode }) {
  const [status, setStatus] = useState<CellStatus | null>(null)

  useEffect(() => {
    if (!signedIn) {
      setStatus(null)
      return
    }
    let cancelled = false
    const poll = () => {
      const token = getAccessToken()
      if (!token) return
      fetchCellStatus(token)
        .then((result) => {
          if (!cancelled) setStatus(result)
        })
        .catch(() => {
          if (!cancelled) setStatus({ cellId: '', status: 'unknown' })
        })
    }
    poll()
    const interval = setInterval(poll, 5000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [signedIn])

  return <CellStatusContext.Provider value={status}>{children}</CellStatusContext.Provider>
}

export function useCellStatus(): CellStatus | null {
  return useContext(CellStatusContext)
}
