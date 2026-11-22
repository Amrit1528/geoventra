ALTER TABLE geoventra.devices
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS offline_since timestamptz,
  ADD COLUMN IF NOT EXISTS last_status_change_at timestamptz,
  ADD COLUMN IF NOT EXISTS connectivity_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS offline_reason text;

UPDATE geoventra.devices
   SET last_seen_at = COALESCE(last_seen_at, last_communication_at),
       connectivity_status = COALESCE(NULLIF(connectivity_status, ''), 'unknown')
 WHERE last_seen_at IS NULL OR connectivity_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_devices_org_connectivity ON geoventra.devices (organisation_id, connectivity_status);
