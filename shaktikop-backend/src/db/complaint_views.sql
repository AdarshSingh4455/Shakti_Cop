-- ============================================================
-- शिकायत देखे जाने का पूरा रिकॉर्ड (ATR के लिए)
--
-- पहले सिर्फ़ complaints.officer_viewed_at था — यानी अधिकारी ने *पहली बार*
-- कब खोली, बस इतना। ATR में यह जानना ज़रूरी है कि किसने, कब-कब देखी —
-- क्योंकि "देखी तो थी, पर कुछ किया नहीं" यही सबसे काम की जवाबदेही है।
-- ============================================================

CREATE TABLE IF NOT EXISTS complaint_views (
  id           BIGSERIAL PRIMARY KEY,
  complaint_id TEXT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  viewer_role  TEXT NOT NULL,      -- 'officer' | 'admin' | 'citizen'
  viewer_id    UUID,
  viewer_name  TEXT,
  viewer_rank  TEXT,               -- SI / SHO / DSP / SP / SSP / super_admin
  viewed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_views_complaint ON complaint_views (complaint_id, viewed_at);
CREATE INDEX IF NOT EXISTS idx_views_viewer    ON complaint_views (viewer_id, viewed_at DESC);
