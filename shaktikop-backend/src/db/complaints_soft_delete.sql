-- ============================================================
-- Complaints — Soft Delete
--
-- पहले "शिकायत हटाना" हमेशा स्थायी (DELETE FROM complaints — permanent) होता
-- था, कोई वापसी का रास्ता नहीं था। शिकायत एक कानूनी/साक्ष्य दस्तावेज़ है — गलती
-- से या दुर्भावना से हटने पर उसे वापस पाने का कोई तरीक़ा ही नहीं था।
--
-- अब "हटाना" सिर्फ़ deleted_at भरता है (असली डेटा बना रहता है) — सामान्य
-- सूचियों/खोज से गायब हो जाती है, पर Super Admin चाहें तो वापस ला सकते हैं।
--
-- पहले से चल रहे (deployed) database पर लगाने के लिए एक बार चलाएं:
--   psql "$DATABASE_URL" -f src/db/complaints_soft_delete.sql
-- ============================================================

ALTER TABLE complaints ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS deleted_by_id TEXT;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS deleted_by_name TEXT;

CREATE INDEX IF NOT EXISTS idx_complaints_deleted_at ON complaints (deleted_at);
