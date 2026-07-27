-- Payments owns this schema and nothing else in the Cell's database.
CREATE SCHEMA IF NOT EXISTS payments;

CREATE TABLE IF NOT EXISTS payments.idempotency_keys (
  key                  text PRIMARY KEY,
  status               text NOT NULL CHECK (status IN ('pending', 'completed')),
  request_fingerprint  text NOT NULL,
  result               jsonb,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- The primary key on `key` is the concurrency control: `reserve` is a single
-- `INSERT ... ON CONFLICT DO NOTHING`, so exactly one concurrent caller ever
-- inserts a row for a given key. See src/pg-idempotency-store.ts.

-- FR-12: an account's daily transfer limit override, if it has set one. A
-- missing row means "no override", not "limit zero"; the platform default
-- applies. See src/pg-limits-store.ts.
CREATE TABLE IF NOT EXISTS payments.daily_limits (
  account_id  text PRIMARY KEY,
  limit_value text NOT NULL,
  updated_at  text NOT NULL
);
