SET search_path TO geoventra, public;

ALTER TABLE geoventra.device_telemetry
    ADD COLUMN IF NOT EXISTS capability text;

ALTER TABLE geoventra.device_telemetry
    ADD COLUMN IF NOT EXISTS source_type text DEFAULT 'device';

ALTER TABLE geoventra.device_telemetry
    ADD COLUMN IF NOT EXISTS quality text DEFAULT 'good';

ALTER TABLE geoventra.device_telemetry
    ADD COLUMN IF NOT EXISTS validation_status text DEFAULT 'valid';

ALTER TABLE geoventra.device_telemetry
    ADD COLUMN IF NOT EXISTS raw_packet_ref text;

CREATE INDEX IF NOT EXISTS device_telemetry_capability_idx
    ON geoventra.device_telemetry (organisation_id, device_id, capability, recorded_at DESC);