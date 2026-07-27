-- The ledger service's schema within one Cell's database.
--
-- One schema per service, enforced at the infrastructure level: this is the
-- only schema this service touches, and no other service's credentials can
-- read it. See docs/ARCHITECTURE.md, section 1.
--
-- `at`, `prev_hash` and `hash` are `text`, not `timestamptz`, deliberately.
-- The ledger's hash covers the exact string ledger-core was given; round
-- tripping through a typed timestamp column risks a value that recomputes to
-- a different hash than the one that sealed the block. Storing the literal
-- string sidesteps that risk entirely.
CREATE SCHEMA IF NOT EXISTS ledger;

CREATE TABLE IF NOT EXISTS ledger.blocks (
  seq        bigint PRIMARY KEY,
  prev_hash  text NOT NULL CHECK (prev_hash ~ '^[0-9a-f]{64}$'),
  at         text NOT NULL,
  hash       text NOT NULL UNIQUE CHECK (hash ~ '^[0-9a-f]{64}$'),
  entries    jsonb NOT NULL CHECK (jsonb_array_length(entries) > 0)
);

-- The primary key on `seq` is the concurrency control, not a side effect of
-- indexing. Two writers racing to append the same sequence number will have
-- exactly one INSERT succeed; the other hits a unique violation, which
-- PgLedgerStore translates into LedgerConflictError. See src/pg-store.ts.
