-- ==========================================================================
-- Fuel tables (phase 5).
--
-- Creates the fuel domain: fuel_sensors, fuel_readings, refuelling_events and
-- fuel_anomaly_alerts.
-- ==========================================================================

SET search_path TO geoventra, public;

CREATE TABLE geoventra.fuel_sensors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    sensor_type text NOT NULL,
    is_calibrated boolean DEFAULT false NOT NULL,
    tank_capacity_l numeric(10,2),
    calibration_curve jsonb,
    is_active boolean DEFAULT true NOT NULL,
    last_calibrated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fuel_sensors_sensor_type_check CHECK ((sensor_type = ANY (ARRAY['ultrasonic'::text, 'capacitive'::text, 'pressure'::text, 'thermal'::text]))),
    CONSTRAINT fuel_sensors_tank_capacity_l_check CHECK (((tank_capacity_l IS NULL) OR (tank_capacity_l >= (0)::numeric)))
);

CREATE TABLE geoventra.fuel_readings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    sensor_id text NOT NULL,
    recorded_at timestamp with time zone NOT NULL,
    fuel_level numeric(10,3) NOT NULL,
    unit text NOT NULL,
    value numeric(10,3) NOT NULL,
    provenance_source_type text,
    provenance_metadata jsonb,
    is_simulated boolean DEFAULT false NOT NULL,
    data_quality text DEFAULT 'good'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fuel_readings_fuel_level_check CHECK ((fuel_level >= (0)::numeric)),
    CONSTRAINT fuel_readings_unit_check CHECK ((unit = ANY (ARRAY['litres'::text, 'percent'::text]))),
    CONSTRAINT fuel_readings_value_check CHECK ((value >= (0)::numeric))
);

CREATE TABLE geoventra.refuelling_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    recorded_at timestamp with time zone NOT NULL,
    litres_added numeric(10,3) NOT NULL,
    source text NOT NULL,
    location_latitude double precision,
    location_longitude double precision,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT refuelling_events_litres_added_check CHECK ((litres_added > (0)::numeric)),
    CONSTRAINT refuelling_events_location_latitude_check CHECK (((location_latitude IS NULL) OR ((location_latitude >= ('-90'::integer)::double precision) AND (location_latitude <= (90)::double precision)))),
    CONSTRAINT refuelling_events_location_longitude_check CHECK (((location_longitude IS NULL) OR ((location_longitude >= ('-180'::integer)::double precision) AND (location_longitude <= (180)::double precision)))),
    CONSTRAINT refuelling_events_source_check CHECK ((source = ANY (ARRAY['pump'::text, 'manual'::text, 'other'::text])))
);

CREATE TABLE geoventra.fuel_anomaly_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    recorded_at timestamp with time zone NOT NULL,
    type text NOT NULL,
    severity text NOT NULL,
    description text NOT NULL,
    is_confirmed boolean DEFAULT false NOT NULL,
    related_reading_id uuid,
    acknowledged_at timestamp with time zone,
    acknowledged_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fuel_anomaly_alerts_severity_check CHECK ((severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]))),
    CONSTRAINT fuel_anomaly_alerts_type_check CHECK ((type = ANY (ARRAY['sudden_drop'::text, 'abnormal_consumption'::text, 'possible_theft'::text, 'sensor_disconnection'::text, 'invalid_reading'::text])))
);

ALTER TABLE ONLY geoventra.fuel_anomaly_alerts
    ADD CONSTRAINT fuel_anomaly_alerts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.fuel_readings
    ADD CONSTRAINT fuel_readings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.fuel_sensors
    ADD CONSTRAINT fuel_sensors_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.refuelling_events
    ADD CONSTRAINT refuelling_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.fuel_readings
    ADD CONSTRAINT fuel_readings_org_vehicle_sensor_time_key UNIQUE (organisation_id, vehicle_id, sensor_id, recorded_at);

ALTER TABLE ONLY geoventra.fuel_sensors
    ADD CONSTRAINT fuel_sensors_org_vehicle_type_key UNIQUE (organisation_id, vehicle_id, sensor_type);

ALTER TABLE ONLY geoventra.fuel_anomaly_alerts
    ADD CONSTRAINT fuel_anomaly_alerts_acknowledged_by_fkey FOREIGN KEY (acknowledged_by) REFERENCES geoventra.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY geoventra.fuel_anomaly_alerts
    ADD CONSTRAINT fuel_anomaly_alerts_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.fuel_anomaly_alerts
    ADD CONSTRAINT fuel_anomaly_alerts_related_reading_id_fkey FOREIGN KEY (related_reading_id) REFERENCES geoventra.fuel_readings(id) ON DELETE SET NULL;

ALTER TABLE ONLY geoventra.fuel_anomaly_alerts
    ADD CONSTRAINT fuel_anomaly_alerts_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES geoventra.vehicles(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.fuel_readings
    ADD CONSTRAINT fuel_readings_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.fuel_readings
    ADD CONSTRAINT fuel_readings_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES geoventra.vehicles(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.fuel_sensors
    ADD CONSTRAINT fuel_sensors_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.fuel_sensors
    ADD CONSTRAINT fuel_sensors_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES geoventra.vehicles(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.refuelling_events
    ADD CONSTRAINT refuelling_events_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.refuelling_events
    ADD CONSTRAINT refuelling_events_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES geoventra.vehicles(id) ON DELETE CASCADE;

CREATE INDEX fuel_anomaly_alerts_open_idx ON geoventra.fuel_anomaly_alerts USING btree (organisation_id, recorded_at DESC) WHERE (acknowledged_at IS NULL);

CREATE INDEX fuel_anomaly_alerts_org_time_idx ON geoventra.fuel_anomaly_alerts USING btree (organisation_id, recorded_at DESC);

CREATE INDEX fuel_anomaly_alerts_vehicle_time_idx ON geoventra.fuel_anomaly_alerts USING btree (organisation_id, vehicle_id, recorded_at DESC);

CREATE INDEX fuel_readings_org_time_idx ON geoventra.fuel_readings USING btree (organisation_id, recorded_at DESC);

CREATE INDEX fuel_readings_sensor_time_idx ON geoventra.fuel_readings USING btree (organisation_id, sensor_id, recorded_at DESC);

CREATE INDEX fuel_readings_vehicle_time_idx ON geoventra.fuel_readings USING btree (organisation_id, vehicle_id, recorded_at DESC);

CREATE INDEX fuel_sensors_active_idx ON geoventra.fuel_sensors USING btree (organisation_id, vehicle_id) WHERE (is_active = true);

CREATE INDEX fuel_sensors_vehicle_idx ON geoventra.fuel_sensors USING btree (organisation_id, vehicle_id);

CREATE INDEX refuelling_events_org_time_idx ON geoventra.refuelling_events USING btree (organisation_id, recorded_at DESC);

CREATE INDEX refuelling_events_vehicle_time_idx ON geoventra.refuelling_events USING btree (organisation_id, vehicle_id, recorded_at DESC);
