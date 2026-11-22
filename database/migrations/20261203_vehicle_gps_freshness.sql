ALTER TABLE geoventra.vehicles
  ADD COLUMN IF NOT EXISTS gps_freshness_minutes integer;

ALTER TABLE geoventra.vehicles
  ADD CONSTRAINT vehicles_gps_freshness_minutes_positive
  CHECK (gps_freshness_minutes IS NULL OR gps_freshness_minutes > 0);

CREATE INDEX IF NOT EXISTS idx_vehicles_org_gps_freshness ON geoventra.vehicles (organisation_id, gps_freshness_minutes);
