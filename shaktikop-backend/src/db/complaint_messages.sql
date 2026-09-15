-- ============================================================
-- Complaint Chat — नागरिक और नियुक्त अधिकारी के बीच केस-दायरे में बातचीत
-- पहले से चल रहे (deployed) database पर लगाने के लिए एक बार चलाएं:
--   psql "$DATABASE_URL" -f src/db/complaint_messages.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS complaint_messages (
  id            BIGSERIAL PRIMARY KEY,
  complaint_id  TEXT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  sender_role   TEXT NOT NULL,
  sender_id     TEXT NOT NULL,
  sender_name   TEXT NOT NULL,
  body          TEXT NOT NULL,
  read_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_complaint_messages_complaint ON complaint_messages (complaint_id, created_at);
