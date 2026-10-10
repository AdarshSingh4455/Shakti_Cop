-- ============================================================
-- ShaktiCop — Safe Soft-Delete Support for Officers
--
-- Allows officers to be removed from active service without
-- breaking foreign key references in complaints (officer_id)
-- or losing historical accountability.
-- ============================================================

ALTER TABLE officers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_officers_deleted_at ON officers (deleted_at);
