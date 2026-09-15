-- ============================================================
-- मौजूदा DSP/ASP/SSP को analytics व leaderboard का विकल्प देना
--
-- क्यों: अब तक defaultMonitorMenu में analytics/leaderboard सिर्फ़ IG/DIG को मिलते
-- थे। यह बेमेल था — बैकएंड पर DSP/ASP/SSP की analytics तक पहुँच *पहले से* थी
-- (analytics routes पर कोई blockMonitor नहीं है, और buildScopeClause उनके
-- circle/ज़िले के हिसाब से डेटा छानता है)। यानी क्षमता मौजूद थी, बस menu में विकल्प
-- नहीं दिखता था — इसलिए वे अपने ही क्षेत्र के आंकड़े देख नहीं पाते थे, जबकि निगरानी
-- करना ही उनकी भूमिका है।
--
-- कोड में डिफ़ॉल्ट ठीक कर दिया गया है, पर वह सिर्फ़ *नए* खातों पर लागू होता है।
-- यह माइग्रेशन पहले से बने खातों को भी वही विकल्प देती है।
--
-- ⚠️ यह पहुँच नहीं बढ़ाती: हर analytics query buildScopeClause से गुज़रती है, इसलिए
--    DSP को अपने circle का, ASP/SSP को अपने ज़िले (या चुने थानों) का ही डेटा दिखेगा।
--    blockMonitor उन्हें हर बदलाव-कार्रवाई से पहले की तरह रोकता रहेगा — यह सिर्फ़
--    पढ़ने की सुविधा है।
--
-- चलाएं:
--   psql "$DATABASE_URL" -f src/db/monitor_analytics_menu.sql
--
-- बार-बार चलाना सुरक्षित है (पहले से मौजूद कुंजियाँ वैसी ही रहती हैं)।
-- ============================================================

UPDATE admins
SET menu_permissions =
      COALESCE(menu_permissions, '{}'::jsonb)
      || jsonb_build_object('analytics', true, 'leaderboard', true)
WHERE admin_role = 'monitor'
  AND rank IN ('DSP', 'ASP', 'SSP')
  AND (
        menu_permissions IS NULL
     OR menu_permissions->>'analytics' IS DISTINCT FROM 'true'
     OR menu_permissions->>'leaderboard' IS DISTINCT FROM 'true'
  );

-- जाँच — कितने खातों को अब यह विकल्प मिला है
SELECT rank,
       count(*) AS total,
       count(*) FILTER (WHERE menu_permissions->>'analytics' = 'true') AS analytics_enabled
FROM admins
WHERE admin_role = 'monitor'
GROUP BY rank
ORDER BY rank;
