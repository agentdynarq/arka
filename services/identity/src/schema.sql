-- Identity owns this schema and nothing else in the Cell's database. It never
-- reads accounts.accounts or ledger.blocks directly; account provisioning
-- goes through @arka/accounts' AccountsService.open, the same boundary any
-- other consumer crosses. See docs/ARCHITECTURE.md, section 1.
--
-- Every timestamp in this schema is `text`, an ISO 8601 string supplied by
-- the application, never `timestamptz`. This matches accounts.opened_at and
-- ledger.blocks.at: `pg` parses `timestamptz` into a JS `Date` automatically,
-- which would silently break every store's contract of returning the exact
-- ISO string it was given.
CREATE SCHEMA IF NOT EXISTS identity;

-- Login credentials. Separate from accounts.accounts (@arka/accounts), which
-- owns display name and customer linkage; this table owns who is allowed to
-- authenticate. password_hash is Argon2id-encoded, never plaintext.
CREATE TABLE IF NOT EXISTS identity.users (
  user_id            text PRIMARY KEY,
  username            text NOT NULL UNIQUE,
  password_hash       text NOT NULL,
  role                text NOT NULL CHECK (role IN ('customer', 'operator')),
  customer_id         text,
  mfa_secret          text NOT NULL,
  failed_login_count  integer NOT NULL DEFAULT 0,
  locked_until        text,
  created_at          text NOT NULL
);

-- One row per login. A family groups every refresh token descended from one
-- authentication; reusing a token that has already been rotated away marks
-- the whole family revoked, per docs/adr and README.md in this package.
CREATE TABLE IF NOT EXISTS identity.session_families (
  family_id   text PRIMARY KEY,
  user_id     text NOT NULL,
  role        text NOT NULL CHECK (role IN ('customer', 'operator')),
  revoked     boolean NOT NULL DEFAULT false
);

-- Refresh tokens are stored hashed (sha256), never in plaintext, same
-- reasoning as a password hash: a database read alone must never be enough
-- to impersonate a session. used_at marks the token consumed by a rotation;
-- a second rotation attempt against an already-used token is the reuse
-- signal that revokes session_families.revoked for the whole family.
CREATE TABLE IF NOT EXISTS identity.refresh_tokens (
  token_hash   text PRIMARY KEY,
  family_id    text NOT NULL REFERENCES identity.session_families (family_id),
  used_at      text,
  expires_at   text NOT NULL
);

CREATE INDEX IF NOT EXISTS refresh_tokens_by_family ON identity.refresh_tokens (family_id);

-- Access tokens carry their own short expiry independent of refresh
-- rotation: an access token stays valid until it expires even after the
-- refresh token issued alongside it has been rotated away.
CREATE TABLE IF NOT EXISTS identity.access_tokens (
  token_hash   text PRIMARY KEY,
  family_id    text NOT NULL REFERENCES identity.session_families (family_id),
  user_id      text NOT NULL,
  role         text NOT NULL CHECK (role IN ('customer', 'operator')),
  expires_at   text NOT NULL
);

-- FR-01. The preserved registry: what survived the 2065 collapse in backup.
-- Re-verification checks a submitted (customerId, registryDocumentId) pair
-- against this table. Liveness is simulated, never checked here or anywhere.
CREATE TABLE IF NOT EXISTS identity.registry_entries (
  customer_id          text NOT NULL,
  registry_document_id text NOT NULL,
  full_name            text NOT NULL,
  PRIMARY KEY (customer_id, registry_document_id)
);

-- FR-02. KYC document metadata and bytes. Uploaded before account opening
-- references it by id.
CREATE TABLE IF NOT EXISTS identity.kyc_documents (
  document_id   text PRIMARY KEY,
  filename      text NOT NULL,
  mime_type     text NOT NULL,
  size_bytes    integer NOT NULL,
  uploaded_at   text NOT NULL,
  bytes         bytea NOT NULL
);

-- FR-02. One row per account-opening application. Phase 2 has no operator
-- review queue built, so status moves straight to 'approved' on submission
-- with a document present; the column stays meaningful for when a review
-- step exists.
CREATE TABLE IF NOT EXISTS identity.account_openings (
  customer_id      text PRIMARY KEY,
  account_id       text NOT NULL,
  full_name        text NOT NULL,
  date_of_birth    text NOT NULL,
  email            text NOT NULL,
  phone            text NOT NULL,
  kyc_document_id  text NOT NULL,
  status           text NOT NULL CHECK (status IN ('pending_review', 'approved', 'rejected')),
  opened_at        text NOT NULL
);

-- Generic fixed-window rate limiting, keyed by caller (for example
-- "login:alice"). One row per (key, window_start); hitting the same window
-- again is a single INSERT ... ON CONFLICT DO UPDATE incrementing count,
-- same concurrency-safe shape as payments.idempotency_keys.
CREATE TABLE IF NOT EXISTS identity.rate_limit_hits (
  key           text NOT NULL,
  window_start  bigint NOT NULL,
  count         integer NOT NULL DEFAULT 1,
  PRIMARY KEY (key, window_start)
);
