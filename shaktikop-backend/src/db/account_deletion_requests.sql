-- ============================================================
-- Account Deletion Requests — DPDP Act 2023 "मिटाने का अधिकार"
-- पहले से चल रहे (deployed) database पर लगाने के लिए एक बार चलाएं:
--   psql "$DATABASE_URL" -f src/db/account_deletion_requests.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS account_deletion_requests (
  id            BIGSERIAL PRIMARY KEY,
  citizen_id    UUID NOT NULL REFERENCES citizens(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending',
  reason        TEXT,
  reviewed_by   TEXT,
  reviewed_by_name TEXT,
  review_note   TEXT,
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_status ON account_deletion_requests (status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_deletion_requests_one_pending ON account_deletion_requests (citizen_id) WHERE status = 'pending';
