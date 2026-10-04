ALTER TABLE statistics ADD COLUMN IF NOT EXISTS suppressed boolean NOT NULL DEFAULT false;
