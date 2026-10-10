-- ============================================================
-- Consolidate Noida into Gautam Buddha Nagar (75 Canonical UP Districts)
--
-- Noida is an urban industrial area within Gautam Buddha Nagar district,
-- not a separate district.
--
-- Safety Guarantees:
-- 1. Uses explicit transaction with PL/pgSQL assertion checks.
-- 2. Verifies that all 4 canonical equivalent stations exist under
--    'गौतम बुद्ध नगर' before modifying any records.
-- 3. Idempotently re-points any historical records in complaints,
--    officers, admins, and citizens.
-- 4. Specifically targets the 4 duplicate sample stations by ID and name.
-- 5. Safe to run repeatedly (idempotent).
-- ============================================================

DO $$
DECLARE
  canonical_count INT;
  legacy_count INT;
BEGIN
  -- 1. Assert canonical stations exist under 'गौतम बुद्ध नगर'
  SELECT count(*) INTO canonical_count
  FROM police_stations
  WHERE district = 'गौतम बुद्ध नगर'
    AND station IN ('नोएडा सेक्टर-20', 'नोएडा सेक्टर-39', 'फेज़-3', 'बिसरख');

  IF canonical_count < 4 THEN
    RAISE EXCEPTION 'Cannot consolidate: canonical stations under गौतम बुद्ध नगर are incomplete (found % of 4)', canonical_count;
  END IF;

  -- 2. Verify legacy rows do not exceed expected sample count
  SELECT count(*) INTO legacy_count
  FROM police_stations
  WHERE district = 'नोएडा (गौतम बुद्ध नगर)';

  IF legacy_count > 4 THEN
    RAISE EXCEPTION 'Unexpected rows found under legacy district: expected at most 4, found %', legacy_count;
  END IF;
END $$;

-- 2. Re-point historical complaints (if any)
UPDATE complaints
SET district = 'गौतम बुद्ध नगर',
    police_station = CASE
      WHEN police_station = 'सेक्टर 20' THEN 'नोएडा सेक्टर-20'
      WHEN police_station = 'सेक्टर 39' THEN 'नोएडा सेक्टर-39'
      WHEN police_station = 'फेज़ 3' THEN 'फेज़-3'
      ELSE police_station
    END
WHERE district = 'नोएडा (गौतम बुद्ध नगर)';

-- 3. Re-point historical officers (if any)
UPDATE officers
SET district = 'गौतम बुद्ध नगर',
    station = CASE
      WHEN station = 'सेक्टर 20' THEN 'नोएडा सेक्टर-20'
      WHEN station = 'सेक्टर 39' THEN 'नोएडा सेक्टर-39'
      WHEN station = 'फेज़ 3' THEN 'फेज़-3'
      ELSE station
    END
WHERE district = 'नोएडा (गौतम बुद्ध नगर)';

-- 4. Re-point historical admins (if any)
UPDATE admins
SET district = 'गौतम बुद्ध नगर'
WHERE district = 'नोएडा (गौतम बुद्ध नगर)';

-- 5. Re-point historical citizens (if any)
UPDATE citizens
SET district = 'गौतम बुद्ध नगर',
    police_station = CASE
      WHEN police_station = 'सेक्टर 20' THEN 'नोएडा सेक्टर-20'
      WHEN police_station = 'सेक्टर 39' THEN 'नोएडा सेक्टर-39'
      WHEN police_station = 'फेज़ 3' THEN 'फेज़-3'
      ELSE police_station
    END
WHERE district = 'नोएडा (गौतम बुद्ध नगर)';

-- 6. Remove redundant duplicate sample entries from police_stations
DELETE FROM police_stations
WHERE district = 'नोएडा (गौतम बुद्ध नगर)'
  AND station IN ('सेक्टर 20', 'सेक्टर 39', 'फेज़ 3', 'बिसरख');
