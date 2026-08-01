'use client'

import { createContext, useContext, useState } from 'react'
import type { Dispatch, ReactNode, SetStateAction } from 'react'

const DEFAULT_OPERATOR_ID = 'operator-1'

/**
 * No operator login exists in this scope (same honesty note health-map's
 * page already carried before this shell pass): this is a free-text
 * identity, not a session. Lifted out of W5's page body into the sidebar
 * (lane-c/app-shell) so the destructive quarantine form no longer carries
 * its own identity input, while staying a real, editable field: dual
 * approval genuinely needs two distinct operators, demonstrated today with
 * two separate browser contexts, and the existing e2e coverage for that
 * (`e2e/tests/operator-journey.spec.ts`) drives this exact control by its
 * label, unchanged, just relocated.
 */
const OperatorIdContext = createContext<[string, Dispatch<SetStateAction<string>>] | null>(null)

export function OperatorProvider({ children }: { readonly children: ReactNode }) {
  const state = useState(DEFAULT_OPERATOR_ID)
  return <OperatorIdContext.Provider value={state}>{children}</OperatorIdContext.Provider>
}

export function useOperatorId(): [string, Dispatch<SetStateAction<string>>] {
  const value = useContext(OperatorIdContext)
  if (!value) throw new Error('useOperatorId must be used within OperatorProvider')
  return value
}
