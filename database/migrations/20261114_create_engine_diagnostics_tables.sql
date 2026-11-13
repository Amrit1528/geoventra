-- ==========================================================================
-- Engine diagnostics tables (phase 6).
--
-- Creates the engine diagnostics domain: engine_devices,
-- engine_telemetry_readings, engine_dtcs, engine_dtc_events and
-- engine_health_alerts.
-- ==========================================================================

SET search_path TO geoventra, public;

CREATE TABLE geoventra.engine_devices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    vehicle_id uuid,
    device_id text NOT NULL,
    device_type text DEFAULT 'obd_dongle'::text NOT NULL,
    protocol text DEFAULT 'obd2'::text NOT NULL,
    manufacturer text,
    model text,
    firmware_version text,
    status text DEFAULT 'offline'::text NOT NULL,
    last_seen_at timestamp with time zone,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE geoventra.engine_telemetry_readings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    device_id text,
    metric text NOT NULL,
    pid text,
    value double precision NOT NULL,
    unit text NOT NULL,
    source_classification text DEFAULT 'simulated'::text NOT NULL,
    data_quality text DEFAULT 'good'::text NOT NULL,
    recorded_at timestamp with time zone NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    protocol_metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE geoventra.engine_dtcs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    code text NOT NULL,
    category text DEFAULT 'P'::text NOT NULL,
    description text,
    severity text DEFAULT 'info'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    mil_on boolean DEFAULT false NOT NULL,
    first_detected_at timestamp with time zone NOT NULL,
    last_detected_at timestamp with time zone NOT NULL,
    occurrence_count integer DEFAULT 1 NOT NULL,
    freeze_frame jsonb,
    acknowledged boolean DEFAULT false NOT NULL,
    acknowledged_at timestamp with time zone,
    acknowledged_by uuid,
    resolved boolean DEFAULT false NOT NULL,
    resolved_at timestamp with time zone,
    resolved_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE geoventra.engine_dtc_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    dtc_id uuid,
    code text NOT NULL,
    event_type text NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb
);

CREATE TABLE geoventra.engine_health_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    rule_id text NOT NULL,
    severity text DEFAULT 'info'::text NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    observed_value double precision,
    observed_unit text,
    threshold_value double precision,
    first_occurrence_at timestamp with time zone DEFAULT now() NOT NULL,
    last_occurrence_at timestamp with time zone DEFAULT now() NOT NULL,
    occurrence_count integer DEFAULT 1 NOT NULL,
    acknowledged boolean DEFAULT false NOT NULL,
    acknowledged_at timestamp with time zone,
    acknowledged_by uuid,
    resolved boolean DEFAULT false NOT NULL,
    resolved_at timestamp with time zone,
    resolved_by uuid,
    source_classification text DEFAULT 'simulated'::text NOT NULL,
    related_dtc text,
    related_metric text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY geoventra.engine_devices
    ADD CONSTRAINT engine_devices_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.engine_dtc_events
    ADD CONSTRAINT engine_dtc_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.engine_dtcs
    ADD CONSTRAINT engine_dtcs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.engine_health_alerts
    ADD CONSTRAINT engine_health_alerts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.engine_telemetry_readings
    ADD CONSTRAINT engine_telemetry_readings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.engine_devices
    ADD CONSTRAINT engine_devices_org_device_key UNIQUE (organisation_id, device_id);

ALTER TABLE ONLY geoventra.engine_dtcs
    ADD CONSTRAINT engine_dtcs_org_vehicle_code_key UNIQUE (organisation_id, vehicle_id, code);

ALTER TABLE ONLY geoventra.engine_devices
    ADD CONSTRAINT engine_devices_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.engine_devices
    ADD CONSTRAINT engine_devices_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES geoventra.vehicles(id) ON DELETE SET NULL;

ALTER TABLE ONLY geoventra.engine_dtc_events
    ADD CONSTRAINT engine_dtc_events_dtc_id_fkey FOREIGN KEY (dtc_id) REFERENCES geoventra.engine_dtcs(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.engine_dtc_events
    ADD CONSTRAINT engine_dtc_events_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.engine_dtc_events
    ADD CONSTRAINT engine_dtc_events_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES geoventra.vehicles(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.engine_dtcs
    ADD CONSTRAINT engine_dtcs_acknowledged_by_fkey FOREIGN KEY (acknowledged_by) REFERENCES geoventra.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY geoventra.engine_dtcs
    ADD CONSTRAINT engine_dtcs_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.engine_dtcs
    ADD CONSTRAINT engine_dtcs_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES geoventra.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY geoventra.engine_dtcs
    ADD CONSTRAINT engine_dtcs_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES geoventra.vehicles(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.engine_health_alerts
    ADD CONSTRAINT engine_health_alerts_acknowledged_by_fkey FOREIGN KEY (acknowledged_by) REFERENCES geoventra.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY geoventra.engine_health_alerts
    ADD CONSTRAINT engine_health_alerts_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.engine_health_alerts
    ADD CONSTRAINT engine_health_alerts_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES geoventra.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY geoventra.engine_health_alerts
    ADD CONSTRAINT engine_health_alerts_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES geoventra.vehicles(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.engine_telemetry_readings
    ADD CONSTRAINT engine_telemetry_readings_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.engine_telemetry_readings
    ADD CONSTRAINT engine_telemetry_readings_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES geoventra.vehicles(id) ON DELETE CASCADE;

CREATE INDEX engine_devices_org_idx ON geoventra.engine_devices USING btree (organisation_id);

CREATE INDEX engine_devices_vehicle_idx ON geoventra.engine_devices USING btree (organisation_id, vehicle_id);

CREATE INDEX engine_dtcs_org_vehicle_idx ON geoventra.engine_dtcs USING btree (organisation_id, vehicle_id);

CREATE INDEX engine_dtcs_status_idx ON geoventra.engine_dtcs USING btree (organisation_id, status);

CREATE INDEX engine_health_alerts_org_vehicle_idx ON geoventra.engine_health_alerts USING btree (organisation_id, vehicle_id);

CREATE INDEX engine_health_alerts_recovery_idx ON geoventra.engine_health_alerts USING btree (organisation_id, vehicle_id, resolved);

CREATE INDEX engine_health_alerts_status_idx ON geoventra.engine_health_alerts USING btree (organisation_id, acknowledged, resolved);

CREATE INDEX engine_telemetry_metric_idx ON geoventra.engine_telemetry_readings USING btree (organisation_id, vehicle_id, metric, recorded_at DESC);

CREATE INDEX engine_telemetry_org_vehicle_time_idx ON geoventra.engine_telemetry_readings USING btree (organisation_id, vehicle_id, recorded_at DESC);
