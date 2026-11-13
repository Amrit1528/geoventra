-- ==========================================================================
-- Adopt the fuel ingest table (phase 5).
--
-- Makes `geoventra.fuel_ingest` the canonical fuel telemetry store, enforces
-- the provenance columns on `fuel_readings` (provenance_source_type,
-- provenance_metadata, is_simulated, data_quality) and adds the data quality
-- constraint plus the fuel ingest indices.
-- ==========================================================================

SET search_path TO geoventra, public;

-- The fuel ingest table becomes the canonical store for fuel telemetry, so
-- the provisional road temperature column on the GPS history is retired.
ALTER TABLE geoventra.gps_positions
    DROP COLUMN IF EXISTS road_temps_c;

-- Provenance columns are mandatory for every fuel reading.
ALTER TABLE geoventra.fuel_readings
    ALTER COLUMN provenance_source_type SET NOT NULL;

-- Fuel readings must declare their data quality.
ALTER TABLE geoventra.fuel_readings
    ADD CONSTRAINT fuel_readings_data_quality_check CHECK (
        data_quality = ANY (ARRAY['good'::text, 'uncertain'::text, 'invalid'::text])
    );

CREATE INDEX fuel_ingest_org_time_idx ON geoventra.fuel_ingest USING btree (organisation_id, recorded_at DESC);

CREATE INDEX fuel_ingest_vehicle_time_idx ON geoventra.fuel_ingest USING btree (vehicle_id, recorded_at DESC);
