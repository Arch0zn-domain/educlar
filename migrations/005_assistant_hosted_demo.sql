CREATE TABLE IF NOT EXISTS assistant_cache (
  key text PRIMARY KEY,
  user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  owner text NOT NULL,
  response text,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS assistant_cache_expiry ON assistant_cache(expires_at);
-- One atomic row per UTC day enforces both account and installation budgets.
CREATE TABLE IF NOT EXISTS assistant_budget (
  day date PRIMARY KEY,
  calls integer NOT NULL DEFAULT 0,
  users jsonb NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS demo_otp (
  phone text PRIMARY KEY,
  code text NOT NULL,
  expires_at timestamptz NOT NULL
);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS encrypted_bytes bytea;
