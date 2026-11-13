-- ==========================================================================
-- Odometer / engine hour type fix (phase 1).
--
-- The odometer and engine hour counters were created as integers, which
-- truncated fractional kilometres. This migration widens them to fixed scale
-- numeric columns and adds the supporting odometer index.
-- ==========================================================================

SET search_path TO geoventra, public;

-- The odometer and engine hour counters were originally stored as integers,
-- which truncated fractional kilometres. Widen them to fixed scale numerics.
ALTER TABLE geoventra.vehicles
    ALTER COLUMN odometer_km TYPE numeric(12,2) USING odometer_km::numeric(12,2);

ALTER TABLE geoventra.vehicles
    ALTER COLUMN engine_hours TYPE numeric(10,2) USING engine_hours::numeric(10,2);

ALTER TABLE geoventra.vehicle_live_status
    ALTER COLUMN odometer_km TYPE numeric(12,2) USING odometer_km::numeric(12,2);

ALTER TABLE geoventra.vehicle_live_status
    ALTER COLUMN engine_hours TYPE numeric(10,2) USING engine_hours::numeric(10,2);

ALTER TABLE geoventra.gps_positions
    ALTER COLUMN odometer_km TYPE numeric(12,2) USING odometer_km::numeric(12,2);

ALTER TABLE geoventra.gps_positions
    ALTER COLUMN engine_hours TYPE numeric(10,2) USING engine_hours::numeric(10,2);

CREATE INDEX idx_vehicles_org_odometer ON geoventra.vehicles USING btree (organisation_id, odometer_km);
