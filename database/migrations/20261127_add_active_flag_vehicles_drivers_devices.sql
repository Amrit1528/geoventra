-- GEOVENTRA — active flag for vehicles, drivers, devices (enable/disable)
-- Additive, backward-compatible. Existing rows default to TRUE.

ALTER TABLE geoventra.vehicles
  ADD COLUMN IF NOT EXISTS active_flag BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE geoventra.drivers
  ADD COLUMN IF NOT EXISTS active_flag BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE geoventra.devices
  ADD COLUMN IF NOT EXISTS active_flag BOOLEAN NOT NULL DEFAULT TRUE;

-- Helpful indexes for active/inactive filtering.
CREATE INDEX IF NOT EXISTS idx_vehicles_org_active_flag ON geoventra.vehicles (organisation_id, active_flag);
CREATE INDEX IF NOT EXISTS idx_drivers_org_active_flag ON geoventra.drivers (organisation_id, active_flag);
CREATE INDEX IF NOT EXISTS idx_devices_org_active_flag ON geoventra.devices (organisation_id, active_flag);