-- ============================================================
-- Refresh Tokens
--
-- पहले सिर्फ़ एक 7-दिन वाला access token (JWT) होता था, कोई refresh token नहीं
-- था। अब access token छोटी अवधि (डिफ़ॉल्ट 1 घंटा) का है, और यह टेबल लंबी अवधि
-- के, अलग से revoke किए जा सकने वाले refresh tokens रखती है।
--
-- पहले से चल रहे (deployed) database पर लगाने के लिए एक बार चलाएं:
--   psql "$DATABASE_URL" -f src/db/refresh_tokens.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          BIGSERIAL PRIMARY KEY,
  token_hash  TEXT NOT NULL UNIQUE,
  user_id     TEXT NOT NULL,
  role        TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens (user_id, role);
