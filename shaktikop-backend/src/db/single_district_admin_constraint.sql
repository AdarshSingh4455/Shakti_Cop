-- ============================================================
-- Migration: Ensure single active District Admin per district
--
-- Description:
--   Enforces that each district in Uttar Pradesh can have at most one
--   primary active District Admin (admin_role = 'district_admin').
--
-- Scope:
--   - Partial unique index on TRIM(LOWER(district))
--   - Only applies to active accounts (is_active = true) with admin_role = 'district_admin'
--   - Does NOT affect the Global Super Admin (admin_role = 'super_admin')
--   - Does NOT affect monitor roles (DSP / ASP / SSP / IG / DIG)
--
-- Rollback implication:
--   DROP INDEX IF EXISTS admins_district_main_active_uidx;
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS admins_district_main_active_uidx
ON admins (TRIM(LOWER(district)))
WHERE admin_role = 'district_admin' AND is_active = true AND district IS NOT NULL;
