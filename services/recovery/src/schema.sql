-- Recovery owns this schema and nothing else. It lives in its own
-- control-plane Postgres, not any Cell's database: this service holds no
-- customer data, only operator actions and Cell health observations, per
-- docs/ARCHITECTURE.md section 1 ("Control plane, a separate trust zone").
--
-- Timestamps are `text`, an ISO 8601 string supplied by the application,
-- never `timestamptz`: `pg` parses `timestamptz` into a JS `Date`
-- automatically, silently breaking a store's contract of returning the
-- exact ISO string it was given. Same lesson as `services/identity`.
CREATE SCHEMA IF NOT EXISTS recovery;

-- One row per Cell. `approved_by` is a JSON array of distinct operator ids;
-- dual approval is enforced by `addApprover`'s atomic UPDATE checking the
-- array does not already contain the approving operator, in
-- src/pg-quarantine-store.ts.
CREATE TABLE IF NOT EXISTS recovery.quarantine_cells (
  cell_id      text PRIMARY KEY,
  state        text NOT NULL CHECK (state IN ('none', 'pending_second_approval', 'quarantined')),
  direction    text CHECK (direction IN ('quarantine', 'lift')),
  approved_by  jsonb NOT NULL DEFAULT '[]'::jsonb,
  reason       text
);

-- The append-only, hash-chained operator audit trail (FR-25). `seq` is the
-- concurrency control, the same primary-key-collision-becomes-a-retry
-- pattern as ledger.blocks in @arka/ledger: two concurrent operator actions
-- racing to append the next record both compute the same next seq, and
-- whichever INSERT loses hits the primary key and is translated into
-- AuditTrailConflictError for the caller to retry against the new head.
CREATE TABLE IF NOT EXISTS recovery.audit_trail (
  seq         integer PRIMARY KEY,
  prev_hash   text NOT NULL,
  actor       text NOT NULL,
  action      text NOT NULL,
  cell_id     text,
  occurred_at text NOT NULL,
  hash        text NOT NULL
);
