-- ==========================================================================
-- Device integration phase 7.1 (phase 7).
--
-- Creates the device integration domain: device_capabilities,
-- device_manufacturers, device_models, device_model_capabilities,
-- device_assignment_history, device_integration_configs,
-- device_field_mappings, device_connection_status, device_connection_events and
-- device_ingestion_audit, and links the device registry to the new
-- manufacturer / model catalogue.
-- ==========================================================================

SET search_path TO geoventra, public;

-- Manufacturer / model catalogue columns added to the device registry.
ALTER TABLE geoventra.devices
    ADD COLUMN IF NOT EXISTS manufacturer_id uuid;

ALTER TABLE geoventra.devices
    ADD COLUMN IF NOT EXISTS model_id uuid;

ALTER TABLE geoventra.devices
    ADD COLUMN IF NOT EXISTS device_category text;

ALTER TABLE geoventra.devices
    ADD COLUMN IF NOT EXISTS integration_method text;

ALTER TABLE geoventra.devices
    ADD COLUMN IF NOT EXISTS serial_number text;

ALTER TABLE geoventra.devices
    ADD COLUMN IF NOT EXISTS mac_address text;

ALTER TABLE geoventra.devices
    ADD COLUMN IF NOT EXISTS installation_date date;

ALTER TABLE geoventra.devices
    ADD COLUMN IF NOT EXISTS installed_at_location text;

ALTER TABLE geoventra.devices
    ADD COLUMN IF NOT EXISTS warranty_expires_at date;

ALTER TABLE geoventra.devices
    ADD COLUMN IF NOT EXISTS last_firmware_at timestamp with time zone;

ALTER TABLE geoventra.devices
    ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb NOT NULL;

ALTER TABLE geoventra.devices
    ADD CONSTRAINT devices_device_category_check CHECK (
        device_category = ANY (ARRAY['STANDARD_GPS'::text, 'AIS140'::text])
    );

ALTER TABLE geoventra.devices
    ADD CONSTRAINT devices_integration_method_check CHECK (
        integration_method = ANY (ARRAY['API'::text, 'WEBHOOK'::text, 'MQTT'::text, 'TCP'::text])
    );

CREATE TABLE geoventra.device_capabilities (
    code text NOT NULL,
    label text NOT NULL,
    unit text,
    description text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE geoventra.device_manufacturers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    country text,
    website text,
    contact_email text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE geoventra.device_models (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    manufacturer_id uuid NOT NULL,
    name text NOT NULL,
    model_code text NOT NULL,
    device_category text DEFAULT 'STANDARD_GPS'::text NOT NULL,
    integration_method text DEFAULT 'MQTT'::text NOT NULL,
    protocol_version text,
    certification_ref text,
    telemetry_fields jsonb DEFAULT '[]'::jsonb NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT device_models_device_category_check CHECK ((device_category = ANY (ARRAY['STANDARD_GPS'::text, 'AIS140'::text]))),
    CONSTRAINT device_models_integration_method_check CHECK ((integration_method = ANY (ARRAY['API'::text, 'WEBHOOK'::text, 'MQTT'::text, 'TCP'::text])))
);

CREATE TABLE geoventra.device_model_capabilities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    model_id uuid NOT NULL,
    capability text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    unit text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE geoventra.device_assignment_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    device_id uuid NOT NULL,
    vehicle_id uuid,
    action text NOT NULL,
    reason text,
    performed_by uuid,
    performed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT device_assignment_history_action_check CHECK ((action = ANY (ARRAY['assigned'::text, 'replaced'::text, 'unassigned'::text])))
);

CREATE TABLE geoventra.device_integration_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    manufacturer_id uuid,
    model_id uuid,
    device_id uuid,
    name text NOT NULL,
    integration_method text NOT NULL,
    endpoint_url text,
    auth_type text DEFAULT 'none'::text NOT NULL,
    secret_ref text,
    headers jsonb DEFAULT '{}'::jsonb NOT NULL,
    rate_limit_per_minute integer DEFAULT 120 NOT NULL,
    replay_window_seconds integer DEFAULT 300 NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT device_integration_configs_auth_type_check CHECK ((auth_type = ANY (ARRAY['none'::text, 'api_key'::text, 'hmac'::text, 'bearer'::text, 'mtls'::text]))),
    CONSTRAINT device_integration_configs_integration_method_check CHECK ((integration_method = ANY (ARRAY['API'::text, 'WEBHOOK'::text, 'MQTT'::text, 'TCP'::text])))
);

CREATE TABLE geoventra.device_field_mappings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    manufacturer_id uuid,
    model_id uuid,
    source_field text NOT NULL,
    target_metric text NOT NULL,
    data_type text DEFAULT 'number'::text NOT NULL,
    unit text,
    scale numeric(14,6),
    value_offset numeric(14,6),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT device_field_mappings_data_type_check CHECK ((data_type = ANY (ARRAY['number'::text, 'string'::text, 'boolean'::text, 'timestamp'::text])))
);

CREATE TABLE geoventra.device_connection_status (
    device_id uuid NOT NULL,
    organisation_id uuid NOT NULL,
    state text DEFAULT 'offline'::text NOT NULL,
    last_message_at timestamp with time zone,
    last_heartbeat_at timestamp with time zone,
    messages_last_hour integer DEFAULT 0 NOT NULL,
    consecutive_failures integer DEFAULT 0 NOT NULL,
    last_error text,
    last_error_at timestamp with time zone,
    latency_ms integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT device_connection_status_state_check CHECK ((state = ANY (ARRAY['online'::text, 'offline'::text, 'degraded'::text, 'unassigned'::text])))
);

CREATE TABLE geoventra.device_connection_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    device_id uuid NOT NULL,
    event text NOT NULL,
    detail text,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT device_connection_events_event_check CHECK ((event = ANY (ARRAY['connected'::text, 'disconnected'::text, 'degraded'::text, 'message'::text, 'error'::text])))
);

CREATE TABLE geoventra.device_ingestion_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    device_id uuid,
    manufacturer_id uuid,
    model_id uuid,
    message_id text,
    source text NOT NULL,
    outcome text NOT NULL,
    reason text,
    payload_bytes integer,
    latency_ms integer,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT device_ingestion_audit_outcome_check CHECK ((outcome = ANY (ARRAY['accepted'::text, 'duplicate'::text, 'rejected'::text, 'invalid'::text, 'unauthorized'::text]))),
    CONSTRAINT device_ingestion_audit_source_check CHECK ((source = ANY (ARRAY['mqtt'::text, 'webhook'::text, 'http'::text, 'tcp'::text, 'api'::text])))
);

ALTER TABLE ONLY geoventra.device_assignment_history
    ADD CONSTRAINT device_assignment_history_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.device_capabilities
    ADD CONSTRAINT device_capabilities_pkey PRIMARY KEY (code);

ALTER TABLE ONLY geoventra.device_connection_events
    ADD CONSTRAINT device_connection_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.device_connection_status
    ADD CONSTRAINT device_connection_status_pkey PRIMARY KEY (device_id);

ALTER TABLE ONLY geoventra.device_field_mappings
    ADD CONSTRAINT device_field_mappings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.device_ingestion_audit
    ADD CONSTRAINT device_ingestion_audit_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.device_integration_configs
    ADD CONSTRAINT device_integration_configs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.device_manufacturers
    ADD CONSTRAINT device_manufacturers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.device_model_capabilities
    ADD CONSTRAINT device_model_capabilities_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.device_models
    ADD CONSTRAINT device_models_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.device_field_mappings
    ADD CONSTRAINT device_field_mappings_organisation_id_model_id_source_field_key UNIQUE (organisation_id, model_id, source_field, target_metric);

ALTER TABLE ONLY geoventra.device_manufacturers
    ADD CONSTRAINT device_manufacturers_organisation_id_code_key UNIQUE (organisation_id, code);

ALTER TABLE ONLY geoventra.device_model_capabilities
    ADD CONSTRAINT device_model_capabilities_model_id_capability_key UNIQUE (model_id, capability);

ALTER TABLE ONLY geoventra.device_models
    ADD CONSTRAINT device_models_organisation_id_manufacturer_id_model_code_key UNIQUE (organisation_id, manufacturer_id, model_code);

ALTER TABLE ONLY geoventra.device_assignment_history
    ADD CONSTRAINT device_assignment_history_device_id_fkey FOREIGN KEY (device_id) REFERENCES geoventra.devices(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.device_assignment_history
    ADD CONSTRAINT device_assignment_history_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.device_assignment_history
    ADD CONSTRAINT device_assignment_history_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES geoventra.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY geoventra.device_assignment_history
    ADD CONSTRAINT device_assignment_history_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES geoventra.vehicles(id) ON DELETE SET NULL;

ALTER TABLE ONLY geoventra.device_connection_events
    ADD CONSTRAINT device_connection_events_device_id_fkey FOREIGN KEY (device_id) REFERENCES geoventra.devices(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.device_connection_events
    ADD CONSTRAINT device_connection_events_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.device_connection_status
    ADD CONSTRAINT device_connection_status_device_id_fkey FOREIGN KEY (device_id) REFERENCES geoventra.devices(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.device_connection_status
    ADD CONSTRAINT device_connection_status_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.device_field_mappings
    ADD CONSTRAINT device_field_mappings_manufacturer_id_fkey FOREIGN KEY (manufacturer_id) REFERENCES geoventra.device_manufacturers(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.device_field_mappings
    ADD CONSTRAINT device_field_mappings_model_id_fkey FOREIGN KEY (model_id) REFERENCES geoventra.device_models(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.device_field_mappings
    ADD CONSTRAINT device_field_mappings_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.device_ingestion_audit
    ADD CONSTRAINT device_ingestion_audit_device_id_fkey FOREIGN KEY (device_id) REFERENCES geoventra.devices(id) ON DELETE SET NULL;

ALTER TABLE ONLY geoventra.device_ingestion_audit
    ADD CONSTRAINT device_ingestion_audit_manufacturer_id_fkey FOREIGN KEY (manufacturer_id) REFERENCES geoventra.device_manufacturers(id) ON DELETE SET NULL;

ALTER TABLE ONLY geoventra.device_ingestion_audit
    ADD CONSTRAINT device_ingestion_audit_model_id_fkey FOREIGN KEY (model_id) REFERENCES geoventra.device_models(id) ON DELETE SET NULL;

ALTER TABLE ONLY geoventra.device_ingestion_audit
    ADD CONSTRAINT device_ingestion_audit_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.device_integration_configs
    ADD CONSTRAINT device_integration_configs_device_id_fkey FOREIGN KEY (device_id) REFERENCES geoventra.devices(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.device_integration_configs
    ADD CONSTRAINT device_integration_configs_manufacturer_id_fkey FOREIGN KEY (manufacturer_id) REFERENCES geoventra.device_manufacturers(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.device_integration_configs
    ADD CONSTRAINT device_integration_configs_model_id_fkey FOREIGN KEY (model_id) REFERENCES geoventra.device_models(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.device_integration_configs
    ADD CONSTRAINT device_integration_configs_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.device_manufacturers
    ADD CONSTRAINT device_manufacturers_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.device_model_capabilities
    ADD CONSTRAINT device_model_capabilities_capability_fkey FOREIGN KEY (capability) REFERENCES geoventra.device_capabilities(code) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.device_model_capabilities
    ADD CONSTRAINT device_model_capabilities_model_id_fkey FOREIGN KEY (model_id) REFERENCES geoventra.device_models(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.device_model_capabilities
    ADD CONSTRAINT device_model_capabilities_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.device_models
    ADD CONSTRAINT device_models_manufacturer_id_fkey FOREIGN KEY (manufacturer_id) REFERENCES geoventra.device_manufacturers(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.device_models
    ADD CONSTRAINT device_models_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.devices
    ADD CONSTRAINT devices_manufacturer_id_fkey FOREIGN KEY (manufacturer_id) REFERENCES geoventra.device_manufacturers(id) ON DELETE SET NULL;

ALTER TABLE ONLY geoventra.devices
    ADD CONSTRAINT devices_model_id_fkey FOREIGN KEY (model_id) REFERENCES geoventra.device_models(id) ON DELETE SET NULL;

CREATE INDEX device_assignment_history_device_idx ON geoventra.device_assignment_history USING btree (organisation_id, device_id, performed_at DESC);

CREATE INDEX device_connection_events_device_idx ON geoventra.device_connection_events USING btree (organisation_id, device_id, occurred_at DESC);

CREATE INDEX device_connection_status_org_idx ON geoventra.device_connection_status USING btree (organisation_id, state);

CREATE INDEX device_field_mappings_model_idx ON geoventra.device_field_mappings USING btree (organisation_id, model_id);

CREATE INDEX device_ingestion_audit_device_idx ON geoventra.device_ingestion_audit USING btree (organisation_id, device_id, received_at DESC);

CREATE INDEX device_ingestion_audit_org_idx ON geoventra.device_ingestion_audit USING btree (organisation_id, received_at DESC);

CREATE INDEX device_integration_configs_org_idx ON geoventra.device_integration_configs USING btree (organisation_id, integration_method, enabled);

CREATE INDEX device_manufacturers_org_idx ON geoventra.device_manufacturers USING btree (organisation_id, name);

CREATE INDEX device_model_capabilities_model_idx ON geoventra.device_model_capabilities USING btree (model_id, enabled);

CREATE INDEX device_models_org_idx ON geoventra.device_models USING btree (organisation_id, manufacturer_id, name);

CREATE INDEX devices_org_manufacturer_idx ON geoventra.devices USING btree (organisation_id, manufacturer_id);

CREATE INDEX devices_org_model_idx ON geoventra.devices USING btree (organisation_id, model_id);

CREATE TRIGGER device_field_mappings_set_updated_at BEFORE UPDATE ON geoventra.device_field_mappings FOR EACH ROW EXECUTE FUNCTION geoventra.set_updated_at();

CREATE TRIGGER device_integration_configs_set_updated_at BEFORE UPDATE ON geoventra.device_integration_configs FOR EACH ROW EXECUTE FUNCTION geoventra.set_updated_at();

CREATE TRIGGER device_manufacturers_set_updated_at BEFORE UPDATE ON geoventra.device_manufacturers FOR EACH ROW EXECUTE FUNCTION geoventra.set_updated_at();

CREATE TRIGGER device_model_capabilities_set_updated_at BEFORE UPDATE ON geoventra.device_model_capabilities FOR EACH ROW EXECUTE FUNCTION geoventra.set_updated_at();

CREATE TRIGGER device_models_set_updated_at BEFORE UPDATE ON geoventra.device_models FOR EACH ROW EXECUTE FUNCTION geoventra.set_updated_at();
