-- ==========================================================================
-- TPMS tables (phase 6).
--
-- Creates the tyre pressure monitoring domain: tpms_sensors, tpms_readings,
-- tpms_sensor_events and tpms_vehicle_config.
-- ==========================================================================

SET search_path TO geoventra, public;

CREATE TABLE geoventra.tpms_sensors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    sensor_id text NOT NULL,
    tyre_position text NOT NULL,
    pressure_unit text DEFAULT 'psi'::text NOT NULL,
    temperature_unit text DEFAULT 'c'::text NOT NULL,
    sensor_serial text NOT NULL,
    sensor_type text NOT NULL,
    is_calibrated boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    last_calibrated_at timestamp with time zone,
    tank_capacity_l numeric(10,2),
    is_enrolled boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tpms_sensors_pressure_unit_check CHECK ((pressure_unit = ANY (ARRAY['psi'::text, 'kPa'::text, 'bar'::text]))),
    CONSTRAINT tpms_sensors_sensor_type_check CHECK ((sensor_type = ANY (ARRAY['direct'::text, 'indirect'::text]))),
    CONSTRAINT tpms_sensors_tank_capacity_l_check CHECK (((tank_capacity_l IS NULL) OR (tank_capacity_l >= (0)::numeric))),
    CONSTRAINT tpms_sensors_temperature_unit_check CHECK ((temperature_unit = ANY (ARRAY['c'::text, 'f'::text]))),
    CONSTRAINT tpms_sensors_tyre_position_check CHECK ((tyre_position = ANY (ARRAY['front_left'::text, 'front_right'::text, 'rear_left'::text, 'rear_right'::text, 'inner_dual'::text, 'outer_dual'::text, 'spare'::text])))
);

CREATE TABLE geoventra.tpms_readings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    sensor_id text NOT NULL,
    tyre_position text NOT NULL,
    recorded_at timestamp with time zone NOT NULL,
    pressure numeric(8,2) NOT NULL,
    pressure_unit text DEFAULT 'psi'::text NOT NULL,
    temperature numeric(5,1),
    temperature_unit text DEFAULT 'c'::text NOT NULL,
    battery_percentage numeric(5,1),
    signal_strength text,
    provenance_source_type text NOT NULL,
    provenance_metadata jsonb,
    is_simulated boolean DEFAULT false NOT NULL,
    data_quality text DEFAULT 'good'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tpms_readings_battery_percentage_check CHECK (((battery_percentage >= (0)::numeric) AND (battery_percentage <= (100)::numeric))),
    CONSTRAINT tpms_readings_data_quality_check CHECK ((data_quality = ANY (ARRAY['good'::text, 'uncertain'::text, 'invalid'::text]))),
    CONSTRAINT tpms_readings_pressure_check CHECK ((pressure >= (0)::numeric)),
    CONSTRAINT tpms_readings_pressure_unit_check CHECK ((pressure_unit = ANY (ARRAY['psi'::text, 'kPa'::text, 'bar'::text]))),
    CONSTRAINT tpms_readings_temperature_unit_check CHECK ((temperature_unit = ANY (ARRAY['c'::text, 'f'::text])))
);

CREATE TABLE geoventra.tpms_sensor_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    sensor_id text NOT NULL,
    tyre_position text NOT NULL,
    event_type text NOT NULL,
    severity text NOT NULL,
    pressure numeric(8,2),
    pressure_unit text DEFAULT 'psi'::text NOT NULL,
    temperature numeric(5,1),
    temperature_unit text DEFAULT 'c'::text NOT NULL,
    threshold_pressure numeric(8,2),
    threshold_type text DEFAULT 'min'::text NOT NULL,
    message text NOT NULL,
    acknowledged boolean DEFAULT false NOT NULL,
    acknowledged_at timestamp with time zone,
    acknowledged_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tpms_sensor_events_event_type_check CHECK ((event_type = ANY (ARRAY['low_pressure'::text, 'critical_pressure'::text, 'high_pressure'::text, 'rapid_pressure_loss'::text, 'high_temperature'::text, 'sensor_disconnected'::text, 'battery_low'::text, 'sensor_calibrated'::text, 'sensor_replaced'::text]))),
    CONSTRAINT tpms_sensor_events_pressure_unit_check CHECK ((pressure_unit = ANY (ARRAY['psi'::text, 'kPa'::text, 'bar'::text]))),
    CONSTRAINT tpms_sensor_events_severity_check CHECK ((severity = ANY (ARRAY['information'::text, 'warning'::text, 'critical'::text]))),
    CONSTRAINT tpms_sensor_events_temperature_unit_check CHECK ((temperature_unit = ANY (ARRAY['c'::text, 'f'::text]))),
    CONSTRAINT tpms_sensor_events_threshold_type_check CHECK ((threshold_type = ANY (ARRAY['min'::text, 'max'::text])))
);

CREATE TABLE geoventra.tpms_vehicle_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    axle_count integer DEFAULT 2 NOT NULL,
    tyre_layout jsonb DEFAULT '["front_left", "front_right", "rear_left", "rear_right"]'::jsonb NOT NULL,
    recommended_pressure_psi numeric(8,2) DEFAULT 32 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tpms_vehicle_config_axle_count_check CHECK ((axle_count >= 1))
);

ALTER TABLE ONLY geoventra.tpms_readings
    ADD CONSTRAINT tpms_readings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.tpms_sensor_events
    ADD CONSTRAINT tpms_sensor_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.tpms_sensors
    ADD CONSTRAINT tpms_sensors_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.tpms_vehicle_config
    ADD CONSTRAINT tpms_vehicle_config_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.tpms_readings
    ADD CONSTRAINT tpms_readings_org_vehicle_sensor_time_key UNIQUE (organisation_id, vehicle_id, sensor_id, recorded_at);

ALTER TABLE ONLY geoventra.tpms_sensors
    ADD CONSTRAINT tpms_sensors_org_vehicle_serial_key UNIQUE (organisation_id, vehicle_id, sensor_serial);

ALTER TABLE ONLY geoventra.tpms_vehicle_config
    ADD CONSTRAINT tpms_vehicle_config_org_vehicle_key UNIQUE (organisation_id, vehicle_id);

ALTER TABLE ONLY geoventra.tpms_readings
    ADD CONSTRAINT tpms_readings_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.tpms_readings
    ADD CONSTRAINT tpms_readings_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES geoventra.vehicles(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.tpms_sensor_events
    ADD CONSTRAINT tpms_sensor_events_acknowledged_by_fkey FOREIGN KEY (acknowledged_by) REFERENCES geoventra.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY geoventra.tpms_sensor_events
    ADD CONSTRAINT tpms_sensor_events_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.tpms_sensor_events
    ADD CONSTRAINT tpms_sensor_events_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES geoventra.vehicles(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.tpms_sensors
    ADD CONSTRAINT tpms_sensors_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.tpms_sensors
    ADD CONSTRAINT tpms_sensors_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES geoventra.vehicles(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.tpms_vehicle_config
    ADD CONSTRAINT tpms_vehicle_config_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.tpms_vehicle_config
    ADD CONSTRAINT tpms_vehicle_config_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES geoventra.vehicles(id) ON DELETE CASCADE;

CREATE INDEX tpms_readings_org_time_idx ON geoventra.tpms_readings USING btree (organisation_id, recorded_at DESC);

CREATE INDEX tpms_readings_sensor_time_idx ON geoventra.tpms_readings USING btree (organisation_id, sensor_id, recorded_at DESC);

CREATE INDEX tpms_readings_vehicle_time_idx ON geoventra.tpms_readings USING btree (organisation_id, vehicle_id, recorded_at DESC);

CREATE INDEX tpms_sensor_events_open_idx ON geoventra.tpms_sensor_events USING btree (organisation_id, created_at DESC) WHERE (acknowledged IS NULL);

CREATE INDEX tpms_sensor_events_type_idx ON geoventra.tpms_sensor_events USING btree (event_type DESC);

CREATE INDEX tpms_sensor_events_vehicle_time_idx ON geoventra.tpms_sensor_events USING btree (organisation_id, vehicle_id, created_at DESC);

CREATE INDEX tpms_sensors_active_idx ON geoventra.tpms_sensors USING btree (organisation_id, vehicle_id) WHERE (is_active = true);

CREATE INDEX tpms_sensors_position_idx ON geoventra.tpms_sensors USING btree (tyre_position);

CREATE INDEX tpms_sensors_vehicle_idx ON geoventra.tpms_sensors USING btree (organisation_id, vehicle_id);

CREATE INDEX tpms_vehicle_config_vehicle_idx ON geoventra.tpms_vehicle_config USING btree (vehicle_id);
