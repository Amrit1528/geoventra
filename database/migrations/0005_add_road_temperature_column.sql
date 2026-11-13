-- ==========================================================================
-- Road temperature column (phase 3).
--
-- Captures the ambient road temperature next to the GPS fix. The column is
-- provisionally stored on `gps_positions` and is superseded by
-- `geoventra.fuel_ingest.road_temps_c` once the fuel ingest table is adopted.
-- ==========================================================================

SET search_path TO geoventra, public;

-- Road temperature was first captured next to the GPS fix itself.
ALTER TABLE geoventra.gps_positions
    ADD COLUMN IF NOT EXISTS road_temps_c numeric(5,2);
