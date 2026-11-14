SET search_path TO geoventra, public;

CREATE TABLE IF NOT EXISTS geoventra.tyres (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    serial_number text,
    manufacturer text,
    brand text,
    size text,
    category text,
    position text,
    installed_on date,
    installed_odometer_km numeric,
    purchase_price numeric,
    warranty_expires_at date,
    expected_service_life_km numeric,
    current_condition text DEFAULT 'good',
    last_service_at timestamp with time zone,
    last_service_odometer_km numeric,
    last_service_notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT tyres_pkey PRIMARY KEY (id),
    CONSTRAINT tyres_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE,
    CONSTRAINT tyres_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES geoventra.vehicles(id) ON DELETE CASCADE
);
-- ============================================================================
-- Fix: tpms_wheel_readings table creation with correct FK references.
-- ============================================================================

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
