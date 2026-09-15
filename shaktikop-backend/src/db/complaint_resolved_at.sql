-- ============================================================
-- resolved_at — निस्तारण का असली समय (प्रदर्शन-आंकड़ों के लिए)
--
-- समस्या:
-- अब तक "निस्तारण में लगा समय" (avgResolutionHours) इस तरह निकाला जाता था:
--     updated_at - created_at
-- पर updated_at किसी भी बदलाव पर आगे बढ़ जाता है (schema में trigger लगा है)।
-- और सबसे अहम — नागरिक की प्रतिक्रिया/रेटिंग हमेशा शिकायत बंद होने के *बाद* ही
-- आती है, और वह भी complaints पंक्ति को अपडेट करती है। यानी:
--
--   अधिकारी ने 2 घंटे में मामला निपटाया, नागरिक ने 5 दिन बाद रेटिंग दी
--   → आंकड़ों में उसका "निस्तारण-समय" 5 दिन दर्ज होता।
--
-- इससे अधिकारी-leaderboard, ज़िला/थाना तुलना और IG/DIG की पूरी निगरानी — सब
-- ग़लत तस्वीर दिखाते, और अच्छा काम करने वाले अधिकारी ख़राब दिखते।
--
-- हल: निस्तारण का समय अलग कॉलम में, जो सिर्फ़ स्थिति बदलने पर एक बार भरता है।
--
-- नीचे पुराना डेटा complaint_history से भरा जाता है — वहां हर स्थिति-परिवर्तन
-- अपने असली समय के साथ पहले से दर्ज है, इसलिए पुराने आंकड़े भी सही हो जाते हैं।
--
-- चलाने के लिए:
--   psql "$DATABASE_URL" -f src/db/complaint_resolved_at.sql
-- ============================================================

ALTER TABLE complaints ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

-- पुराना डेटा भरें — complaint_history में दर्ज पहली "निस्तारित/अस्वीकृत" प्रविष्टि का समय
UPDATE complaints c
SET resolved_at = h.first_closed_at
FROM (
  SELECT complaint_id, min(created_at) AS first_closed_at
  FROM complaint_history
  WHERE status IN ('निस्तारित', 'अस्वीकृत')
  GROUP BY complaint_id
) h
WHERE c.id = h.complaint_id
  AND c.resolved_at IS NULL
  AND c.status IN ('निस्तारित', 'अस्वीकृत');

-- जिनका इतिहास किसी वजह से मौजूद नहीं है, उनके लिए updated_at ही सबसे अच्छा
-- उपलब्ध अनुमान है (पहले जैसा) — कम से कम खाली न रहे
UPDATE complaints
SET resolved_at = updated_at
WHERE resolved_at IS NULL
  AND status IN ('निस्तारित', 'अस्वीकृत');

CREATE INDEX IF NOT EXISTS idx_complaints_resolved_at ON complaints (resolved_at);
