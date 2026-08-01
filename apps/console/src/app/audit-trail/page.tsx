'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchAuditTrail, ApiError } from '@/lib/api'
import type { AuditTrailEntry } from '@/lib/api'
import { PageHeader, Panel, Field, SelectField, Button, Alert, Badge, Skeleton, EmptyState } from '@arka/ui'

function auditTone(action: string): 'neutral' | 'warning' | 'danger' {
  if (action === 'quarantine.approved') return 'danger'
  if (action.startsWith('quarantine.')) return 'warning'
  if (action.startsWith('lift.')) return action === 'lift.approved' ? 'neutral' : 'warning'
  return 'neutral'
}

function describeAction(action: string): string {
  switch (action) {
    case 'quarantine.requested':
      return 'Quarantine requested'
    case 'quarantine.approval_recorded':
      return 'Quarantine approval recorded'
    case 'quarantine.approved':
      return 'Quarantine approved'
    case 'lift.requested':
      return 'Lift requested'
    case 'lift.approval_recorded':
      return 'Lift approval recorded'
    case 'lift.approved':
      return 'Lift approved'
    default:
      return action
  }
}

function describeResult(action: string): string {
  if (action === 'quarantine.approved') return 'Quarantined'
  if (action.startsWith('quarantine.')) return 'Pending'
  if (action === 'lift.approved') return 'Healthy'
  if (action.startsWith('lift.')) return 'Pending'
  return '-'
}

export default function AuditTrailPage() {
  const [trail, setTrail] = useState<AuditTrailEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 10

  const loadTrail = useCallback(async () => {
    try {
      const data = await fetchAuditTrail()
      setTrail(data)
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not fetch operator audit trail')
    }
  }, [])

  useEffect(() => {
    loadTrail()
  }, [loadTrail])

  const filteredTrail = useMemo(() => {
    return (trail ?? []).filter((entry) => {
      if (filter === 'quarantine' && !entry.action.startsWith('quarantine.')) return false
      if (filter === 'lift' && !entry.action.startsWith('lift.')) return false
      if (filter === 'cell-1' && entry.cellId !== 'cell-1') return false
      if (filter === 'cell-2' && entry.cellId !== 'cell-2') return false

      if (search.trim()) {
        const q = search.toLowerCase()
        const actorMatch = entry.actor.toLowerCase().includes(q)
        const actionMatch = describeAction(entry.action).toLowerCase().includes(q) || entry.action.toLowerCase().includes(q)
        const cellMatch = (entry.cellId ?? '').toLowerCase().includes(q)
        return actorMatch || actionMatch || cellMatch
      }

      return true
    })
  }, [trail, filter, search])

  useEffect(() => {
    setCurrentPage(1)
  }, [search, filter])

  const totalPages = Math.max(1, Math.ceil(filteredTrail.length / PAGE_SIZE))
  const paginatedTrail = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return filteredTrail.slice(start, start + PAGE_SIZE)
  }, [filteredTrail, currentPage])

  return (
    <>
      <PageHeader
        breadcrumb="Arka / Audit trail"
        title="Operator Audit Trail"
        context="Append-only, hash-chained log of all operator quarantine, lift, and administrative actions (FR-25)."
      />

      {error && <Alert>{error}</Alert>}

      {!trail && !error && <Skeleton height="320px" />}

      {trail && (
        <Panel title="Audit Log Entries">
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <Field
                id="audit-search"
                label="Search log"
                placeholder="Filter by operator ID, action, or Cell..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div style={{ width: 180 }}>
              <SelectField
                id="audit-filter"
                label="Category Filter"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                options={[
                  { value: 'all', label: 'All actions' },
                  { value: 'quarantine', label: 'Quarantine events' },
                  { value: 'lift', label: 'Lift events' },
                  { value: 'cell-1', label: 'Cell-1 events' },
                  { value: 'cell-2', label: 'Cell-2 events' },
                ]}
              />
            </div>
          </div>

          {filteredTrail.length === 0 ? (
            <EmptyState title="No audit events found" hint="Try modifying your search or filter selection." />
          ) : (
            <>
              <table className="ui-table">
                <thead>
                  <tr>
                    <th>Event ID</th>
                    <th>Timestamp</th>
                    <th>Operator</th>
                    <th>Action</th>
                    <th>Target Cell</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedTrail.map((entry) => (
                    <tr key={entry.id}>
                      <td className="ui-hash" style={{ fontSize: '12px', color: '#64748B' }}>{entry.id.slice(0, 8)}...</td>
                      <td className="ui-hash">{new Date(entry.occurredAt).toLocaleString()}</td>
                      <td style={{ fontWeight: 600 }}>{entry.actor}</td>
                      <td>{describeAction(entry.action)}</td>
                      <td className="ui-hash">{entry.cellId ?? '-'}</td>
                      <td>
                        <Badge tone={auditTone(entry.action)}>{describeResult(entry.action)}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 20,
                  paddingTop: 14,
                  borderTop: '1px solid var(--hairline)',
                  fontSize: '13px',
                  color: 'var(--ink-soft)',
                  flexWrap: 'wrap',
                  gap: 12,
                }}
              >
                <span>
                  Showing {Math.min((currentPage - 1) * PAGE_SIZE + 1, filteredTrail.length)}–
                  {Math.min(currentPage * PAGE_SIZE, filteredTrail.length)} of {filteredTrail.length} entries
                </span>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Button
                    variant="secondary"
                    fullWidth={false}
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <span style={{ fontWeight: 600, color: 'var(--ink)' }}>
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    variant="secondary"
                    fullWidth={false}
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </Panel>
      )}
    </>
  )
}
