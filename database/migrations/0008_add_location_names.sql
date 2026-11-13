-- ==========================================================================
-- Location names (phase 4).
--
-- Adds reverse geocoded place names to the live status and the position
-- history, together with the location lookup indices.
-- ==========================================================================

SET search_path TO geoventra, public;

-- Reverse geocoded place names for the live map and the position history.
ALTER TABLE geoventra.vehicle_live_status
    ADD COLUMN IF NOT EXISTS location_name text;

ALTER TABLE geoventra.vehicle_live_status
    ADD COLUMN IF NOT EXISTS location_key text;

ALTER TABLE geoventra.vehicle_live_status
    ADD COLUMN IF NOT EXISTS location_updated_at timestamp with time zone;

CREATE INDEX gps_positions_location_name_idx ON geoventra.gps_positions USING btree (vehicle_id, location_name) WHERE (location_name IS NOT NULL);
