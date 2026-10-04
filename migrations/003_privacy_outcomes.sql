ALTER TABLE reviews ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE reviews ADD COLUMN reply_author_id text REFERENCES auth_user(id) ON DELETE SET NULL;
ALTER TABLE reviews ADD COLUMN reply_version integer;
ALTER TABLE reviews ADD COLUMN reply_pending_author_id text REFERENCES auth_user(id) ON DELETE SET NULL;
ALTER TABLE reviews ADD COLUMN reply_pending_version integer;
ALTER TABLE reviews ADD COLUMN reply_pending_id text;
UPDATE reviews r SET reply_author_id=t.claimed_by,reply_version=r.version FROM teachers t WHERE t.id=r.teacher_id AND r.reply IS NOT NULL;
-- Ownership may already have been erased by a legacy account approval.
UPDATE reviews SET reply=NULL,reply_version=NULL WHERE reply IS NOT NULL AND reply_author_id IS NULL;
-- Legacy pending replies have no reviewed snapshot/token; require resubmission.
UPDATE reviews SET reply_pending=NULL;
ALTER TABLE documents ADD COLUMN deletion_requested_at timestamptz;
ALTER TABLE documents ADD COLUMN deletion_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE documents ADD COLUMN deletion_error text;
ALTER TABLE documents ADD COLUMN retry_at timestamptz;
ALTER TABLE reports ADD COLUMN resolved_at timestamptz;
UPDATE reports r SET resolved_at=coalesce((SELECT max(a.created_at) FROM audit a WHERE a.target_id=r.id AND a.action='report.resolve'),now()) WHERE r.status='resolved';
ALTER TABLE privacy_requests ADD COLUMN subject_id text REFERENCES auth_user(id) ON DELETE SET NULL;
ALTER TABLE privacy_requests ADD COLUMN outcome jsonb NOT NULL DEFAULT '{}';
ALTER TABLE privacy_requests ADD COLUMN response text;
ALTER TABLE privacy_requests ADD COLUMN completed_at timestamptz;
ALTER TABLE privacy_requests ADD COLUMN export_data jsonb;
ALTER TABLE privacy_requests ADD COLUMN export_expires_at timestamptz;
-- Previous approvals without a deliverable must return to the work queue.
UPDATE privacy_requests SET status='pending',outcome='{"action":"legacy_approval_requires_fulfillment"}' WHERE status='approved';
CREATE TABLE maintenance_runs (
 id text PRIMARY KEY,started_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,
 status text NOT NULL DEFAULT 'running',deleted_documents integer NOT NULL DEFAULT 0,
 failed_documents integer NOT NULL DEFAULT 0,error text
);
CREATE INDEX documents_cleanup ON documents(deleted_at,retry_at);
