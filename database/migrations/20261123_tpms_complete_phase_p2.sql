-- ==========================================================================
-- TPMS complete P2 — schema extensions, lifecycle and alert-state support.
--
-- Extends the existing TPMS tables (created in 20261113_create_tpms_tables.sql)
-- without dropping or recreating any existing table/column. Adds:
--   1. Canonical reading columns (pressure_kpa, temperature_c, received_at,
--      wheel_position, source metadata) and richer sensor state.
--   2. Vehicle/tyre threshold configuration (recommended ranges, per-tyre
--      overrides) while keeping the legacy layout/config columns.
--   3. Tyre lifecycle and sensor-assignment history tables.
--   4. Per-sensor alert/hysteresis state for dedupe, freshness and trend rules.
--   5. Wheel-position support widened to include dual/multi-axle identifiers.
--
-- No existing migration is modified and no existing data is removed.
-- ==========================================================================

SET search_path TO geoventra, public;

-- ── Vehicle configuration extensions ─────────────────────────────────────────

ALTER TABLE geoventra.tpms_vehicle_config
    ADD COLUMN IF NOT EXISTS wheel_layout text DEFAULT '4x2' NOT NULL,
    ADD COLUMN IF NOT EXISTS wheel_positions jsonb DEFAULT '["FRONT_LEFT","FRONT_RIGHT","REAR_LEFT","REAR_RIGHT"]'::jsonb NOT NULL,
    ADD COLUMN IF NOT EXISTS recommended_pressure_kpa numeric(8,2),
    ADD COLUMN IF NOT EXISTS recommended_pressure_min_kpa numeric(8,2),
    ADD COLUMN IF NOT EXISTS recommended_pressure_max_kpa numeric(8,2),
    ADD COLUMN IF NOT EXISTS high_temperature_c numeric(5,1),
    ADD COLUMN IF NOT EXISTS critical_temperature_c numeric(5,1),
    ADD COLUMN IF NOT EXISTS tyre_thresholds jsonb DEFAULT '{}'::jsonb NOT NULL,
    ADD COLUMN IF NOT EXISTS updated_by uuid;

-- Keep legacy recommended_pressure_psi meaningful; backfill canonical kPa when possible.
UPDATE geoventra.tpms_vehicle_config
   SET recommended_pressure_kpa = COALESCE(recommended_pressure_kpa, recommended_pressure_psi * 6.894757)
 WHERE recommended_pressure_kpa IS NULL AND recommended_pressure_psi IS NOT NULL;

-- ── Sensor extensions ────────────────────────────────────────────────────────

ALTER TABLE geoventra.tpms_sensors
    ADD COLUMN IF NOT EXISTS canonical_position text,
    ADD COLUMN IF NOT EXISTS sensor_label text,
    ADD COLUMN IF NOT EXISTS battery_voltage numeric(6,3),
    ADD COLUMN IF NOT EXISTS battery_status text,
    ADD COLUMN IF NOT EXISTS signal_strength_dbm numeric(6,2),
    ADD COLUMN IF NOT EXISTS last_seen_at timestamp with time zone,
    ADD COLUMN IF NOT EXISTS installed_at timestamp with time zone,
    ADD COLUMN IF NOT EXISTS removed_at timestamp with time zone,
    ADD COLUMN IF NOT EXISTS replacement_reason text,
    ADD COLUMN IF NOT EXISTS tyre_serial text,
    ADD COLUMN IF NOT EXISTS tyre_brand text,
    ADD COLUMN IF NOT EXISTS tyre_model text,
    ADD COLUMN IF NOT EXISTS tyre_size text,
    ADD COLUMN IF NOT EXISTS notes text;

-- Backfill canonical position from legacy values where absent.
UPDATE geoventra.tpms_sensors
   SET canonical_position = UPPER(tyre_position)
 WHERE canonical_position IS NULL AND tyre_position IS NOT NULL;

-- Widen tyre_position check to support multi-axle/dual/custom identifiers while
-- preserving existing rows. Drop and recreate the constraint if it exists.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint c
         JOIN pg_class t ON t.oid = c.conrelid
         JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'geoventra' AND t.relname = 'tpms_sensors' AND c.conname = 'tpms_sensors_tyre_position_check'
    ) THEN
        ALTER TABLE geoventra.tpms_sensors DROP CONSTRAINT tpms_sensors_tyre_position_check;
    END IF;
END $$;

ALTER TABLE geoventra.tpms_sensors
    ADD CONSTRAINT tpms_sensors_tyre_position_check
    CHECK (tyre_position ~ '^[a-z0-9_]+$');

-- ── Reading extensions (canonical units + provenance) ─────────────────────────

ALTER TABLE geoventra.tpms_readings
    ADD COLUMN IF NOT EXISTS wheel_position text,
    ADD COLUMN IF NOT EXISTS pressure_kpa numeric(8,2),
    ADD COLUMN IF NOT EXISTS temperature_c numeric(6,2),
    ADD COLUMN IF NOT EXISTS received_at timestamp with time zone DEFAULT now(),
    ADD COLUMN IF NOT EXISTS sensor_battery_voltage numeric(6,3),
    ADD COLUMN IF NOT EXISTS signal_strength_dbm numeric(6,2),
    ADD COLUMN IF NOT EXISTS vehicle_speed_kph numeric(6,2),
    ADD COLUMN IF NOT EXISTS latitude double precision,
    ADD COLUMN IF NOT EXISTS longitude double precision,
    ADD COLUMN IF NOT EXISTS ignition boolean,
    ADD COLUMN IF NOT EXISTS source_device_id text,
    ADD COLUMN IF NOT EXISTS raw_payload jsonb;

UPDATE geoventra.tpms_readings
   SET wheel_position = COALESCE(wheel_position, UPPER(tyre_position)),
       received_at = COALESCE(received_at, created_at, recorded_at)
 WHERE wheel_position IS NULL OR received_at IS NULL;

-- Backfill canonical pressure/temperature when the stored unit is known.
UPDATE geoventra.tpms_readings
   SET pressure_kpa = CASE pressure_unit
         WHEN 'kPa' THEN pressure
         WHEN 'bar' THEN pressure * 100
         WHEN 'psi' THEN pressure * 6.894757
         ELSE pressure_kpa
       END
 WHERE pressure_kpa IS NULL AND pressure IS NOT NULL;

UPDATE geoventra.tpms_readings
   SET temperature_c = CASE temperature_unit
         WHEN 'c' THEN temperature
         WHEN 'f' THEN (temperature - 32) * 5.0 / 9.0
         ELSE temperature_c
       END
 WHERE temperature_c IS NULL AND temperature IS NOT NULL;

-- ── Sensor event extensions ──────────────────────────────────────────────────

ALTER TABLE geoventra.tpms_sensor_events
    ADD COLUMN IF NOT EXISTS wheel_position text,
    ADD COLUMN IF NOT EXISTS alert_id uuid,
    ADD COLUMN IF NOT EXISTS evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    ADD COLUMN IF NOT EXISTS resolved boolean DEFAULT false NOT NULL,
    ADD COLUMN IF NOT EXISTS resolved_at timestamp with time zone,
    ADD COLUMN IF NOT EXISTS resolved_by uuid,
    ADD COLUMN IF NOT EXISTS dedupe_key text;

UPDATE geoventra.tpms_sensor_events
   SET wheel_position = COALESCE(wheel_position, UPPER(tyre_position))
 WHERE wheel_position IS NULL;

-- ── Tyre lifecycle (installation/replacement/rotation/inspection/repair) ─────

CREATE TABLE IF NOT EXISTS geoventra.tpms_tyre_lifecycle (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    wheel_position text NOT NULL,
    sensor_id text,
    action text NOT NULL,
    tyre_serial text,
    tyre_brand text,
    tyre_model text,
    tyre_size text,
    odometer_km numeric(12,2),
    cost numeric(12,2),
    currency text DEFAULT 'INR'::text NOT NULL,
    notes text,
    performed_at timestamp with time zone DEFAULT now() NOT NULL,
    performed_by uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tpms_tyre_lifecycle_pkey PRIMARY KEY (id),
    CONSTRAINT tpms_tyre_lifecycle_action_check CHECK ((action = ANY (ARRAY['installation'::text, 'replacement'::text, 'rotation'::text, 'inspection'::text, 'repair'::text]))),
    CONSTRAINT tpms_tyre_lifecycle_org_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE,
    CONSTRAINT tpms_tyre_lifecycle_vehicle_fkey FOREIGN KEY (vehicle_id) REFERENCES geoventra.vehicles(id) ON DELETE CASCADE,
    CONSTRAINT tpms_tyre_lifecycle_user_fkey FOREIGN KEY (performed_by) REFERENCES geoventra.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS tpms_tyre_lifecycle_vehicle_time_idx
    ON geoventra.tpms_tyre_lifecycle (organisation_id, vehicle_id, performed_at DESC);

-- ── Sensor assignment history ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS geoventra.tpms_sensor_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    wheel_position text NOT NULL,
    sensor_id text NOT NULL,
    sensor_serial text,
    action text NOT NULL,
    reason text,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    unassigned_at timestamp with time zone,
    performed_by uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tpms_sensor_assignments_pkey PRIMARY KEY (id),
    CONSTRAINT tpms_sensor_assignments_action_check CHECK ((action = ANY (ARRAY['assigned'::text, 'replaced'::text, 'reassigned'::text, 'removed'::text]))),
    CONSTRAINT tpms_sensor_assignments_org_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE,
    CONSTRAINT tpms_sensor_assignments_vehicle_fkey FOREIGN KEY (vehicle_id) REFERENCES geoventra.vehicles(id) ON DELETE CASCADE,
    CONSTRAINT tpms_sensor_assignments_user_fkey FOREIGN KEY (performed_by) REFERENCES geoventra.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS tpms_sensor_assignments_vehicle_idx
    ON geoventra.tpms_sensor_assignments (organisation_id, vehicle_id, assigned_at DESC);

-- ── Alert / hysteresis / freshness state per sensor ──────────────────────────

CREATE TABLE IF NOT EXISTS geoventra.tpms_alert_state (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    wheel_position text NOT NULL,
    sensor_id text,
    alert_type text NOT NULL,
    active boolean DEFAULT false NOT NULL,
    last_value_kpa numeric(8,2),
    last_value_c numeric(6,2),
    last_evaluated_at timestamp with time zone,
    last_triggered_at timestamp with time zone,
    last_cleared_at timestamp with time zone,
    consecutive_breaches integer DEFAULT 0 NOT NULL,
    consecutive_normals integer DEFAULT 0 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tpms_alert_state_pkey PRIMARY KEY (id),
    CONSTRAINT tpms_alert_state_org_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE,
    CONSTRAINT tpms_alert_state_vehicle_fkey FOREIGN KEY (vehicle_id) REFERENCES geoventra.vehicles(id) ON DELETE CASCADE,
    CONSTRAINT tpms_alert_state_unique UNIQUE (organisation_id, vehicle_id, wheel_position, alert_type)
);

CREATE INDEX IF NOT EXISTS tpms_alert_state_vehicle_idx
    ON geoventra.tpms_alert_state (organisation_id, vehicle_id, wheel_position);

-- Helpful index for trend/leak queries on canonical pressure.
CREATE INDEX IF NOT EXISTS tpms_readings_vehicle_position_time_idx
    ON geoventra.tpms_readings (organisation_id, vehicle_id, wheel_position, recorded_at DESC);
