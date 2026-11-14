-- ============================================================================
-- GEOVENTRA — Vehicle device, OBD, telematics, engine, tyre, insurance,
-- odometer, fuel, temperature and alerts (Phases 1-7).
--
-- Creates the database tables that are not yet present in the schema.
-- ============================================================================

SET search_path TO geoventra, public;

-- ── Tyre service record ────────────────────────────────────────────────────
CREATE TABLE geoventra.tyre_services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    tyre_id uuid NOT NULL,
    action text NOT NULL,
    service_provider text,
    service_date date NOT NULL,
    odometer_km integer,
    cost numeric(14,2),
    notes text,
    technician text,
    next_service_at date,
    next_service_odometer_km integer,
    CONSTRAINT tyre_services_action_check CHECK ((action = ANY (ARRAY['installation'::text, 'removal'::text, 'replacement'::text, 'rotation'::text, 'inspection'::text, 'puncture_repair'::text, 'retreading'::text, 'alignment'::text, 'balancing'::text, 'pressure_correction'::text])))
);
ALTER TABLE geoventra.tyre_services ADD CONSTRAINT tyre_services_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES geoventra.vehicles(id) ON DELETE CASCADE;
ALTER TABLE geoventra.tyre_services ADD CONSTRAINT tyre_services_tyre_id_fkey FOREIGN KEY (tyre_id) REFERENCES geoventra.tyres(id) ON DELETE CASCADE;
ALTER TABLE geoventra.tyre_services ADD CONSTRAINT tyre_services_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;
CREATE INDEX tyre_services_vehicle_idx ON geoventra.tyre_services USING btree (organisation_id, vehicle_id, service_date DESC);
CREATE INDEX tyre_services_tyre_idx ON geoventra.tyre_services USING btree (organisation_id, tyre_id, service_date DESC);
CREATE TRIGGER tyre_services_set_updated_at BEFORE UPDATE ON geoventra.tyre_services FOR EACH ROW EXECUTE FUNCTION geoventra.set_updated_at();

-- ── TPMS wheel readings ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS geoventra.tpms_wheel_readings (
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
CREATE INDEX IF NOT EXISTS tpms_wheel_readings_vehicle_idx ON geoventra.tpms_wheel_readings USING btree (organisation_id, vehicle_id, reading_at DESC);
CREATE INDEX IF NOT EXISTS tpms_wheel_readings_sensor_idx ON geoventra.tpms_wheel_readings USING btree (organisation_id, sensor_id, reading_at DESC);

-- ── Odometer history ───────────────────────────────────────────────────────
CREATE TABLE geoventra.odometer_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    odometer_km integer NOT NULL,
    source text NOT NULL,
    reading_at timestamp with time zone NOT NULL,
    confidence text DEFAULT 'medium' NOT NULL,
    note text,
    CONSTRAINT odometer_history_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES geoventra.vehicles(id) ON DELETE CASCADE,
    CONSTRAINT odometer_history_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE
);
CREATE INDEX odometer_history_vehicle_idx ON geoventra.odometer_history USING btree (organisation_id, vehicle_id, reading_at DESC);

-- ── Gear configuration ─────────────────────────────────────────────────────
CREATE TABLE geoventra.gear_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    transmission_type text NOT NULL,
    number_of_gears integer,
    reverse_gear boolean DEFAULT false NOT NULL,
    neutral boolean DEFAULT true NOT NULL,
    gears jsonb DEFAULT '[]'::jsonb NOT NULL,
    last_configured_at timestamp with time zone NOT NULL,
    configured_by uuid,
    CONSTRAINT gear_config_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES geoventra.vehicles(id) ON DELETE CASCADE,
    CONSTRAINT gear_config_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE,
    CONSTRAINT gear_config_transmission_type_check CHECK ((transmission_type = ANY (ARRAY['manual'::text, 'automatic'::text, 'amt'::text, 'cvt'::text, 'dct'::text, 'other'::text])))
);
ALTER TABLE geoventra.gear_config ADD CONSTRAINT gear_config_organisation_id_vehicle_id_key UNIQUE (organisation_id, vehicle_id);
CREATE TRIGGER gear_config_set_updated_at BEFORE UPDATE ON geoventra.gear_config FOR EACH ROW EXECUTE FUNCTION geoventra.set_updated_at();

-- ── Engine telemetry configuration ─────────────────────────────────────────
CREATE TABLE geoventra.engine_telemetry_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    rpm_min_kph numeric(6,2) DEFAULT 0 NOT NULL,
    rpm_max_kph numeric(6,2) DEFAULT 8000 NOT NULL,
    idle_rpm numeric(8,2) DEFAULT 700 NOT NULL,
    overspeed_rpm numeric(8,2),
    temperature_high_c numeric(8,2),
    temperature_critical_c numeric(8,2),
    last_configured_at timestamp with time zone NOT NULL,
    configured_by uuid,
    CONSTRAINT engine_telemetry_config_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES geoventra.vehicles(id) ON DELETE CASCADE,
    CONSTRAINT engine_telemetry_config_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE
);
CREATE INDEX engine_telemetry_config_vehicle_idx ON geoventra.engine_telemetry_config USING btree (organisation_id, vehicle_id);
ALTER TABLE geoventra.engine_telemetry_config ADD CONSTRAINT engine_telemetry_config_organisation_id_vehicle_id_key UNIQUE (organisation_id, vehicle_id);

-- ── OBD adapter config ─────────────────────────────────────────────────────
CREATE TABLE geoventra.obd_adapter_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    device_id uuid NOT NULL,
    manufacturer_id uuid,
    model_id uuid,
    name text NOT NULL,
    integration_method text NOT NULL,
    endpoint_url text,
    auth_type text DEFAULT 'none' NOT NULL,
    secret_ref text,
    headers jsonb DEFAULT '{}'::jsonb NOT NULL,
    parameter_map jsonb DEFAULT '{}'::jsonb NOT NULL,
    rate_limit_per_minute integer DEFAULT 60 NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    last_discovered_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT obd_adapter_config_device_id_fkey FOREIGN KEY (device_id) REFERENCES geoventra.devices(id) ON DELETE CASCADE,
    CONSTRAINT obd_adapter_config_manufacturer_id_fkey FOREIGN KEY (manufacturer_id) REFERENCES geoventra.device_manufacturers(id) ON DELETE SET NULL,
    CONSTRAINT obd_adapter_config_model_id_fkey FOREIGN KEY (model_id) REFERENCES geoventra.device_models(id) ON DELETE SET NULL,
    CONSTRAINT obd_adapter_config_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE,
    CONSTRAINT obd_adapter_config_integration_method_check CHECK ((integration_method = ANY (ARRAY['API'::text, 'WEBHOOK'::text, 'MQTT'::text, 'TCP'::text])))
);
CREATE INDEX obd_adapter_config_device_idx ON geoventra.obd_adapter_config USING btree (organisation_id, device_id);
CREATE TRIGGER obd_adapter_config_set_updated_at BEFORE UPDATE ON geoventra.obd_adapter_config FOR EACH ROW EXECUTE FUNCTION geoventra.set_updated_at();

-- ── Adapter connection status ───────────────────────────────────────────────
CREATE TABLE geoventra.adapter_connection_status (
    device_id uuid NOT NULL,
    organisation_id uuid NOT NULL,
    state text DEFAULT 'offline' NOT NULL,
    last_message_at timestamp with time zone,
    last_heartbeat_at timestamp with time zone,
    messages_last_hour integer DEFAULT 0 NOT NULL,
    consecutive_failures integer DEFAULT 0 NOT NULL,
    last_error text,
    last_error_at timestamp with time zone,
    latency_ms integer,
    last_discovery jsonb,
    CONSTRAINT adapter_connection_status_device_id_organisation_id_key UNIQUE (device_id, organisation_id),
    CONSTRAINT adapter_connection_status_state_check CHECK ((state = ANY (ARRAY['online'::text, 'offline'::text, 'degraded'::text, 'unassigned'::text])))
);
ALTER TABLE geoventra.adapter_connection_status ADD CONSTRAINT adapter_connection_status_device_id_fkey FOREIGN KEY (device_id) REFERENCES geoventra.devices(id) ON DELETE CASCADE;
ALTER TABLE geoventra.adapter_connection_status ADD CONSTRAINT adapter_connection_status_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

-- ── Integration config for vendor-specific telemetry ────────────────────────
CREATE TABLE geoventra.integration_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    device_id uuid NOT NULL,
    manufacturer_id uuid,
    model_id uuid,
    adapter_id uuid,
    endpoint_url text,
    auth_type text DEFAULT 'none' NOT NULL,
    secret_ref text,
    headers jsonb DEFAULT '{}'::jsonb NOT NULL,
    rate_limit_per_minute integer DEFAULT 120 NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT integration_configs_device_id_fkey FOREIGN KEY (device_id) REFERENCES geoventra.devices(id) ON DELETE CASCADE,
    CONSTRAINT integration_configs_manufacturer_id_fkey FOREIGN KEY (manufacturer_id) REFERENCES geoventra.device_manufacturers(id) ON DELETE SET NULL,
    CONSTRAINT integration_configs_model_id_fkey FOREIGN KEY (model_id) REFERENCES geoventra.device_models(id) ON DELETE SET NULL,
    CONSTRAINT integration_configs_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE
);
CREATE INDEX integration_configs_device_idx ON geoventra.integration_configs USING btree (organisation_id, device_id);
CREATE TRIGGER integration_configs_set_updated_at BEFORE UPDATE ON geoventra.integration_configs FOR EACH ROW EXECUTE FUNCTION geoventra.set_updated_at();
