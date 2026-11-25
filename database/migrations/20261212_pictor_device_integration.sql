-- ==========================================================================
-- Pictor device integration (Phase 10+).
--
-- Adds device configuration, command, firmware, telemetry, alarm, health,
-- battery history and sensor reading tables. All tables are tenant-scoped.
-- ==========================================================================

SET search_path TO geoventra, public;

CREATE TABLE IF NOT EXISTS geoventra.device_configurations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    device_id uuid NOT NULL,
    model_id uuid,
    apn text,
    sim_number text,
    server_host text,
    server_port integer,
    transport_mode text DEFAULT 'tcp'::text NOT NULL,
    reporting_interval_seconds integer,
    heartbeat_interval_seconds integer,
    gps_upload_enabled boolean DEFAULT true NOT NULL,
    sleep_mode text,
    geofence_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    alarm_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    raw_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    applied_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT device_configurations_transport_mode_check CHECK (transport_mode = ANY (ARRAY['tcp'::text, 'udp'::text])),
    CONSTRAINT device_configurations_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS geoventra.device_commands (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    device_id uuid NOT NULL,
    command_type text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    priority integer DEFAULT 5 NOT NULL,
    retry_count integer DEFAULT 0 NOT NULL,
    max_retries integer DEFAULT 3 NOT NULL,
    timeout_seconds integer DEFAULT 60 NOT NULL,
    scheduled_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone,
    acknowledged_at timestamp with time zone,
    failed_at timestamp with time zone,
    expired_at timestamp with time zone,
    failure_reason text,
    correlation_id text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT device_commands_status_check CHECK (status = ANY (ARRAY['pending'::text, 'sent'::text, 'acknowledged'::text, 'failed'::text, 'expired'::text])),
    CONSTRAINT device_commands_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS geoventra.device_command_acks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    command_id uuid NOT NULL,
    device_id uuid NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT device_command_acks_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS geoventra.device_firmware (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    device_id uuid NOT NULL,
    firmware_version text NOT NULL,
    hardware_revision text,
    ota_capable boolean DEFAULT false NOT NULL,
    compatibility text,
    update_status text DEFAULT 'idle'::text NOT NULL,
    update_progress integer,
    update_result text,
    installed_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT device_firmware_update_status_check CHECK (update_status = ANY (ARRAY['idle'::text, 'pending'::text, 'in_progress'::text, 'success'::text, 'failed'::text, 'unsupported'::text])),
    CONSTRAINT device_firmware_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS geoventra.device_telemetry (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    device_id uuid NOT NULL,
    metric text NOT NULL,
    value numeric(18,6),
    unit text,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT device_telemetry_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS geoventra.device_alarms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    device_id uuid NOT NULL,
    alarm_type text NOT NULL,
    severity text DEFAULT 'medium'::text NOT NULL,
    message text,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    acknowledged_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT device_alarms_severity_check CHECK (severity = ANY (ARRAY['critical'::text, 'high'::text, 'medium'::text, 'low'::text])),
    CONSTRAINT device_alarms_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS geoventra.device_health (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    device_id uuid NOT NULL,
    signal_strength integer,
    network_status text,
    latency_ms integer,
    messages_last_hour integer DEFAULT 0 NOT NULL,
    consecutive_failures integer DEFAULT 0 NOT NULL,
    last_error text,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT device_health_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS geoventra.device_battery_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    device_id uuid NOT NULL,
    percent numeric(5,2),
    voltage numeric(8,4),
    charging_status text,
    external_power_status text,
    power_source text,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT device_battery_history_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS geoventra.device_sensor_readings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    device_id uuid NOT NULL,
    sensor_type text NOT NULL,
    channel text,
    value numeric(18,6),
    unit text,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT device_sensor_readings_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS geoventra.device_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    device_id uuid NOT NULL,
    remote_address text,
    connected_at timestamp with time zone DEFAULT now() NOT NULL,
    disconnected_at timestamp with time zone,
    last_seen_at timestamp with time zone,
    protocol text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT device_sessions_pkey PRIMARY KEY (id)
);

-- FKs
ALTER TABLE geoventra.device_configurations ADD CONSTRAINT device_configurations_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;
ALTER TABLE geoventra.device_configurations ADD CONSTRAINT device_configurations_device_id_fkey FOREIGN KEY (device_id) REFERENCES geoventra.devices(id) ON DELETE CASCADE;
ALTER TABLE geoventra.device_commands ADD CONSTRAINT device_commands_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;
ALTER TABLE geoventra.device_commands ADD CONSTRAINT device_commands_device_id_fkey FOREIGN KEY (device_id) REFERENCES geoventra.devices(id) ON DELETE CASCADE;
ALTER TABLE geoventra.device_command_acks ADD CONSTRAINT device_command_acks_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;
ALTER TABLE geoventra.device_command_acks ADD CONSTRAINT device_command_acks_command_id_fkey FOREIGN KEY (command_id) REFERENCES geoventra.device_commands(id) ON DELETE CASCADE;
ALTER TABLE geoventra.device_command_acks ADD CONSTRAINT device_command_acks_device_id_fkey FOREIGN KEY (device_id) REFERENCES geoventra.devices(id) ON DELETE CASCADE;
ALTER TABLE geoventra.device_firmware ADD CONSTRAINT device_firmware_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;
ALTER TABLE geoventra.device_firmware ADD CONSTRAINT device_firmware_device_id_fkey FOREIGN KEY (device_id) REFERENCES geoventra.devices(id) ON DELETE CASCADE;
ALTER TABLE geoventra.device_telemetry ADD CONSTRAINT device_telemetry_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;
ALTER TABLE geoventra.device_telemetry ADD CONSTRAINT device_telemetry_device_id_fkey FOREIGN KEY (device_id) REFERENCES geoventra.devices(id) ON DELETE CASCADE;
ALTER TABLE geoventra.device_alarms ADD CONSTRAINT device_alarms_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;
ALTER TABLE geoventra.device_alarms ADD CONSTRAINT device_alarms_device_id_fkey FOREIGN KEY (device_id) REFERENCES geoventra.devices(id) ON DELETE CASCADE;
ALTER TABLE geoventra.device_health ADD CONSTRAINT device_health_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;
ALTER TABLE geoventra.device_health ADD CONSTRAINT device_health_device_id_fkey FOREIGN KEY (device_id) REFERENCES geoventra.devices(id) ON DELETE CASCADE;
ALTER TABLE geoventra.device_battery_history ADD CONSTRAINT device_battery_history_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;
ALTER TABLE geoventra.device_battery_history ADD CONSTRAINT device_battery_history_device_id_fkey FOREIGN KEY (device_id) REFERENCES geoventra.devices(id) ON DELETE CASCADE;
ALTER TABLE geoventra.device_sensor_readings ADD CONSTRAINT device_sensor_readings_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;
ALTER TABLE geoventra.device_sensor_readings ADD CONSTRAINT device_sensor_readings_device_id_fkey FOREIGN KEY (device_id) REFERENCES geoventra.devices(id) ON DELETE CASCADE;
ALTER TABLE geoventra.device_sessions ADD CONSTRAINT device_sessions_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;
ALTER TABLE geoventra.device_sessions ADD CONSTRAINT device_sessions_device_id_fkey FOREIGN KEY (device_id) REFERENCES geoventra.devices(id) ON DELETE CASCADE;

-- Indexes
CREATE INDEX IF NOT EXISTS device_configurations_org_device_idx ON geoventra.device_configurations (organisation_id, device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS device_commands_org_device_idx ON geoventra.device_commands (organisation_id, device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS device_commands_status_idx ON geoventra.device_commands (status, scheduled_at);
CREATE INDEX IF NOT EXISTS device_firmware_org_device_idx ON geoventra.device_firmware (organisation_id, device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS device_telemetry_org_device_idx ON geoventra.device_telemetry (organisation_id, device_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS device_alarms_org_device_idx ON geoventra.device_alarms (organisation_id, device_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS device_health_org_device_idx ON geoventra.device_health (organisation_id, device_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS device_battery_history_org_device_idx ON geoventra.device_battery_history (organisation_id, device_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS device_sensor_readings_org_device_idx ON geoventra.device_sensor_readings (organisation_id, device_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS device_sessions_org_device_idx ON geoventra.device_sessions (organisation_id, device_id, connected_at DESC);
