-- ============================================================================
-- Fix: tpms_wheel_readings table creation with correct FK references.
-- ============================================================================

SET search_path TO geoventra, public;

-- Add primary key to tyres table if it doesn't have one
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'geoventra.tyres'::regclass AND contype = 'p') THEN
    ALTER TABLE geoventra.tyres ADD CONSTRAINT tyres_pkey PRIMARY KEY (id);
  END IF;
END $$;

-- Drop tpms_wheel_readings if it exists (from failed attempt)
DROP TABLE IF EXISTS geoventra.tpms_wheel_readings;

-- Create tpms_wheel_readings table with correct FK references
CREATE TABLE geoventra.tpms_wheel_readings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    sensor_id uuid NOT NULL,
    tyre_id uuid NOT NULL,
    pressure_kpa numeric(8,2),
    temperature_c numeric(8,2),
    reading_at timestamp with time zone NOT NULL,
    CONSTRAINT tpms_wheel_readings_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES geoventra.vehicles(id) ON DELETE CASCADE,
    CONSTRAINT tpms_wheel_readings_sensor_id_fkey FOREIGN KEY (sensor_id) REFERENCES geoventra.tpms_sensors(id) ON DELETE CASCADE,
    CONSTRAINT tpms_wheel_readings_tyre_id_fkey FOREIGN KEY (tyre_id) REFERENCES geoventra.tyres(id) ON DELETE CASCADE,
    CONSTRAINT tpms_wheel_readings_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE
);
CREATE INDEX tpms_wheel_readings_vehicle_idx ON geoventra.tpms_wheel_readings USING btree (organisation_id, vehicle_id, reading_at DESC);
CREATE INDEX tpms_wheel_readings_sensor_idx ON geoventra.tpms_wheel_readings USING btree (organisation_id, sensor_id, reading_at DESC);
