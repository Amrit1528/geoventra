SET search_path TO geoventra, public;

ALTER TABLE geoventra.vehicle_live_status
    ADD COLUMN IF NOT EXISTS stationary_since timestamp with time zone;

ALTER TABLE geoventra.vehicle_live_status
    ADD COLUMN IF NOT EXISTS idle_location_name text;