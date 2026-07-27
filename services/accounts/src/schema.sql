-- Accounts owns this schema and nothing else in the Cell's database. It never
-- reads ledger.blocks directly; every balance and history line comes from
-- calling @arka/ledger's public methods, the same boundary any other
-- consumer crosses. See docs/ARCHITECTURE.md, section 1.
CREATE SCHEMA IF NOT EXISTS accounts;

CREATE TABLE IF NOT EXISTS accounts.accounts (
  account_id    text PRIMARY KEY,
  customer_id   text NOT NULL,
  display_name  text NOT NULL,
  opened_at     text NOT NULL
);

CREATE INDEX IF NOT EXISTS accounts_by_customer ON accounts.accounts (customer_id);
