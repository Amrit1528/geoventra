-- ==========================================================================
-- Core Geoventra schema (phase 1).
--
-- Creates the `geoventra` schema, the required extensions and the foundational
-- tables: organisations, permissions, roles, role_permissions, users,
-- refresh_tokens, api_keys, audit_logs, vehicle_groups, drivers, vehicles,
-- devices, device_assignments, gps_positions, vehicle_live_status, trips,
-- trip_events, geofences, geofence_vehicles, vehicle_geofence_state,
-- vehicle_documents, geofence_events, alerts, maintenance_records,
-- service_schedules, notification_preferences, retention_config and
-- schema_migrations.
--
-- Every object is explicitly qualified with the `geoventra` schema.
-- ==========================================================================

SET search_path TO geoventra, public;

-- PostGIS provides the geography type used by the tracking tables. It is a
-- non trusted extension, so it can only be installed by a superuser; when the
-- database already provides it the statement is skipped.
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS postgis SCHEMA public;
EXCEPTION
    WHEN insufficient_privilege THEN
        RAISE NOTICE 'postgis could not be created (insufficient privilege); assuming it is pre-installed';
END
$$;

CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA public;

CREATE SCHEMA IF NOT EXISTS geoventra;

CREATE TABLE geoventra.organisations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    timezone text DEFAULT 'Asia/Kolkata'::text NOT NULL,
    currency text DEFAULT 'INR'::text NOT NULL,
    country text DEFAULT 'IN'::text NOT NULL,
    logo_url text,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE geoventra.permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    description text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE geoventra.roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT roles_name_check CHECK ((name = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'viewer'::text])))
);

CREATE TABLE geoventra.role_permissions (
    role_id uuid NOT NULL,
    permission_id uuid NOT NULL
);

CREATE TABLE geoventra.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    role_id uuid NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    phone text,
    password_hash text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    avatar_url text,
    preferences jsonb DEFAULT '{"theme": "system", "density": "comfortable"}'::jsonb NOT NULL,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT users_status_check CHECK ((status = ANY (ARRAY['active'::text, 'invited'::text, 'suspended'::text])))
);

CREATE TABLE geoventra.refresh_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    user_agent text,
    ip_address text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE geoventra.api_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    name text NOT NULL,
    prefix text NOT NULL,
    key_hash text NOT NULL,
    scopes text[] DEFAULT '{}'::text[] NOT NULL,
    last_used_at timestamp with time zone,
    revoked_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE geoventra.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    user_id uuid,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id text,
    ip_address text,
    user_agent text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE geoventra.vehicle_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    color text DEFAULT '#0d9488'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE geoventra.drivers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    name text NOT NULL,
    phone text NOT NULL,
    email text NOT NULL,
    license_number text NOT NULL,
    license_expiry date NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    safety_score integer DEFAULT 100 NOT NULL,
    photo_url text,
    address text,
    joined_at date DEFAULT CURRENT_DATE NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT drivers_safety_score_check CHECK (((safety_score >= 0) AND (safety_score <= 100))),
    CONSTRAINT drivers_status_check CHECK ((status = ANY (ARRAY['active'::text, 'on_leave'::text, 'inactive'::text])))
);

CREATE TABLE geoventra.vehicles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    registration_number text NOT NULL,
    name text NOT NULL,
    category text NOT NULL,
    manufacturer text NOT NULL,
    model text NOT NULL,
    fuel_type text NOT NULL,
    year integer NOT NULL,
    vin text DEFAULT ''::text NOT NULL,
    city text,
    group_id uuid,
    assigned_driver_id uuid,
    status text DEFAULT 'offline'::text NOT NULL,
    odometer_km integer DEFAULT 0 NOT NULL,
    engine_hours integer DEFAULT 0 NOT NULL,
    maintenance_status text DEFAULT 'ok'::text NOT NULL,
    insurance_expiry date,
    registration_expiry date,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    fuel_level numeric(8,2),
    fuel_capacity numeric(8,2),
    fuel_level_last_updated timestamp with time zone,
    CONSTRAINT vehicles_category_check CHECK ((category = ANY (ARRAY['car'::text, 'truck'::text, 'bus'::text]))),
    CONSTRAINT vehicles_fuel_type_check CHECK ((fuel_type = ANY (ARRAY['petrol'::text, 'diesel'::text, 'cng'::text, 'electric'::text, 'hybrid'::text]))),
    CONSTRAINT vehicles_maintenance_status_check CHECK ((maintenance_status = ANY (ARRAY['ok'::text, 'due_soon'::text, 'overdue'::text, 'in_service'::text]))),
    CONSTRAINT vehicles_status_check CHECK ((status = ANY (ARRAY['moving'::text, 'idle'::text, 'stopped'::text, 'offline'::text]))),
    CONSTRAINT vehicles_year_check CHECK (((year >= 1980) AND (year <= 2100)))
);

CREATE TABLE geoventra.devices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    device_id text NOT NULL,
    device_type text NOT NULL,
    imei text,
    model text NOT NULL,
    firmware_version text NOT NULL,
    provider text NOT NULL,
    status text DEFAULT 'unassigned'::text NOT NULL,
    last_communication_at timestamp with time zone,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT devices_device_type_check CHECK ((device_type = ANY (ARRAY['gps_tracker'::text, 'obd_dongle'::text, 'asset_tag'::text]))),
    CONSTRAINT devices_status_check CHECK ((status = ANY (ARRAY['online'::text, 'offline'::text, 'degraded'::text, 'unassigned'::text])))
);

CREATE TABLE geoventra.device_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    device_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    unassigned_at timestamp with time zone
);

CREATE TABLE geoventra.gps_positions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    device_id uuid NOT NULL,
    "position" public.geography(Point,4326) NOT NULL,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    speed_kph numeric(6,2) DEFAULT 0 NOT NULL,
    heading numeric(6,2) DEFAULT 0 NOT NULL,
    ignition boolean DEFAULT false NOT NULL,
    accuracy_m numeric(8,2),
    gps_signal text DEFAULT 'ok'::text NOT NULL,
    satellites integer,
    battery_voltage numeric(6,2),
    odometer_km integer,
    engine_hours integer,
    altitude_m numeric(8,2),
    source text NOT NULL,
    event_id text NOT NULL,
    trip_id uuid,
    recorded_at timestamp with time zone NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    location_name text,
    CONSTRAINT gps_positions_gps_signal_check CHECK ((gps_signal = ANY (ARRAY['ok'::text, 'weak'::text, 'none'::text]))),
    CONSTRAINT gps_positions_source_check CHECK ((source = ANY (ARRAY['simulator'::text, 'http'::text, 'mqtt'::text, 'tcp'::text])))
);

CREATE TABLE geoventra.vehicle_live_status (
    vehicle_id uuid NOT NULL,
    organisation_id uuid NOT NULL,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    "position" public.geography(Point,4326) NOT NULL,
    speed_kph numeric(6,2) DEFAULT 0 NOT NULL,
    heading numeric(6,2) DEFAULT 0 NOT NULL,
    ignition boolean DEFAULT false NOT NULL,
    battery_voltage numeric(6,2),
    gps_signal text DEFAULT 'ok'::text NOT NULL,
    accuracy_m numeric(8,2),
    odometer_km integer DEFAULT 0 NOT NULL,
    engine_hours integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'offline'::text NOT NULL,
    last_recorded_at timestamp with time zone NOT NULL,
    last_received_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vehicle_live_status_gps_signal_check CHECK ((gps_signal = ANY (ARRAY['ok'::text, 'weak'::text, 'none'::text]))),
    CONSTRAINT vehicle_live_status_status_check CHECK ((status = ANY (ARRAY['moving'::text, 'idle'::text, 'stopped'::text, 'offline'::text])))
);

CREATE TABLE geoventra.trips (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    driver_id uuid,
    status text DEFAULT 'completed'::text NOT NULL,
    started_at timestamp with time zone NOT NULL,
    ended_at timestamp with time zone,
    distance_km numeric(10,2) DEFAULT 0 NOT NULL,
    duration_seconds integer DEFAULT 0 NOT NULL,
    avg_speed_kph numeric(6,2) DEFAULT 0 NOT NULL,
    max_speed_kph numeric(6,2) DEFAULT 0 NOT NULL,
    idle_seconds integer DEFAULT 0 NOT NULL,
    start_position public.geography(Point,4326),
    end_position public.geography(Point,4326),
    start_latitude double precision NOT NULL,
    start_longitude double precision NOT NULL,
    end_latitude double precision,
    end_longitude double precision,
    start_label text DEFAULT 'Origin'::text NOT NULL,
    end_label text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    destination_label text,
    destination_latitude double precision,
    destination_longitude double precision,
    CONSTRAINT trips_status_check CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'cancelled'::text])))
);

CREATE TABLE geoventra.trip_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    trip_id uuid,
    vehicle_id uuid NOT NULL,
    type text NOT NULL,
    severity text,
    "position" public.geography(Point,4326),
    latitude double precision,
    longitude double precision,
    speed_kph numeric(6,2),
    occurred_at timestamp with time zone NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT trip_events_severity_check CHECK ((severity = ANY (ARRAY['critical'::text, 'high'::text, 'medium'::text, 'low'::text])))
);

CREATE TABLE geoventra.geofences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    type text NOT NULL,
    center public.geography(Point,4326) NOT NULL,
    center_latitude double precision NOT NULL,
    center_longitude double precision NOT NULL,
    radius_m numeric(10,2),
    geometry public.geography(Geometry,4326),
    color text DEFAULT '#0d9488'::text NOT NULL,
    alert_on_entry boolean DEFAULT true NOT NULL,
    alert_on_exit boolean DEFAULT true NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT geofences_type_check CHECK ((type = ANY (ARRAY['circle'::text, 'polygon'::text])))
);

CREATE TABLE geoventra.geofence_vehicles (
    geofence_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    organisation_id uuid NOT NULL
);

CREATE TABLE geoventra.vehicle_geofence_state (
    geofence_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    organisation_id uuid NOT NULL,
    is_inside boolean DEFAULT false NOT NULL,
    last_event_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE geoventra.vehicle_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    name text NOT NULL,
    document_type text NOT NULL,
    document_number text,
    issued_at date,
    expires_at date,
    file_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE geoventra.geofence_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    geofence_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    event_type text NOT NULL,
    "position" public.geography(Point,4326),
    latitude double precision,
    longitude double precision,
    occurred_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT geofence_events_event_type_check CHECK ((event_type = ANY (ARRAY['entry'::text, 'exit'::text])))
);

CREATE TABLE geoventra.alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    vehicle_id uuid,
    driver_id uuid,
    type text NOT NULL,
    severity text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    "position" public.geography(Point,4326),
    latitude double precision,
    longitude double precision,
    occurred_at timestamp with time zone NOT NULL,
    acknowledged_at timestamp with time zone,
    acknowledged_by uuid,
    resolved_at timestamp with time zone,
    resolved_by uuid,
    dedupe_key text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT alerts_severity_check CHECK ((severity = ANY (ARRAY['critical'::text, 'high'::text, 'medium'::text, 'low'::text]))),
    CONSTRAINT alerts_status_check CHECK ((status = ANY (ARRAY['open'::text, 'acknowledged'::text, 'resolved'::text])))
);

CREATE TABLE geoventra.maintenance_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    type text NOT NULL,
    description text NOT NULL,
    vendor text,
    odometer_km numeric(12,2),
    cost numeric(12,2),
    performed_at date NOT NULL,
    status text DEFAULT 'completed'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT maintenance_records_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'completed'::text, 'cancelled'::text]))),
    CONSTRAINT maintenance_records_type_check CHECK ((type = ANY (ARRAY['service'::text, 'repair'::text, 'inspection'::text])))
);

CREATE TABLE geoventra.service_schedules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    name text NOT NULL,
    interval_km integer,
    interval_days integer,
    last_service_at date,
    last_service_km numeric(12,2) DEFAULT 0 NOT NULL,
    next_due_at date,
    next_due_km numeric(12,2),
    status text DEFAULT 'ok'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    interval_engine_hours numeric(10,2),
    last_service_engine_hours numeric(10,2) DEFAULT 0 NOT NULL,
    CONSTRAINT service_schedules_interval_days_check CHECK ((interval_days > 0)),
    CONSTRAINT service_schedules_interval_km_check CHECK ((interval_km > 0)),
    CONSTRAINT service_schedules_status_check CHECK ((status = ANY (ARRAY['ok'::text, 'due_soon'::text, 'overdue'::text, 'in_service'::text])))
);

CREATE TABLE geoventra.notification_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    user_id uuid NOT NULL,
    alert_type text NOT NULL,
    channel text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    min_severity text DEFAULT 'low'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notification_preferences_channel_check CHECK ((channel = ANY (ARRAY['in_app'::text, 'email'::text, 'sms'::text]))),
    CONSTRAINT notification_preferences_min_severity_check CHECK ((min_severity = ANY (ARRAY['critical'::text, 'high'::text, 'medium'::text, 'low'::text])))
);

CREATE TABLE geoventra.retention_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    retention_days integer DEFAULT 7 NOT NULL,
    last_cleaned_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT retention_config_retention_days_check CHECK (((retention_days >= 1) AND (retention_days <= 30)))
);

CREATE TABLE IF NOT EXISTS geoventra.schema_migrations (
    id text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL,
    checksum text NOT NULL
);

ALTER TABLE ONLY geoventra.alerts
    ADD CONSTRAINT alerts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.api_keys
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.device_assignments
    ADD CONSTRAINT device_assignments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.devices
    ADD CONSTRAINT devices_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.drivers
    ADD CONSTRAINT drivers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.geofence_events
    ADD CONSTRAINT geofence_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.geofence_vehicles
    ADD CONSTRAINT geofence_vehicles_pkey PRIMARY KEY (geofence_id, vehicle_id);

ALTER TABLE ONLY geoventra.geofences
    ADD CONSTRAINT geofences_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.gps_positions
    ADD CONSTRAINT gps_positions_pkey PRIMARY KEY (id, recorded_at);

ALTER TABLE ONLY geoventra.maintenance_records
    ADD CONSTRAINT maintenance_records_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.notification_preferences
    ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.organisations
    ADD CONSTRAINT organisations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.retention_config
    ADD CONSTRAINT retention_config_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (role_id, permission_id);

ALTER TABLE ONLY geoventra.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.service_schedules
    ADD CONSTRAINT service_schedules_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.trip_events
    ADD CONSTRAINT trip_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.trips
    ADD CONSTRAINT trips_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.vehicle_documents
    ADD CONSTRAINT vehicle_documents_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.vehicle_geofence_state
    ADD CONSTRAINT vehicle_geofence_state_pkey PRIMARY KEY (geofence_id, vehicle_id);

ALTER TABLE ONLY geoventra.vehicle_groups
    ADD CONSTRAINT vehicle_groups_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.vehicle_live_status
    ADD CONSTRAINT vehicle_live_status_pkey PRIMARY KEY (vehicle_id);

ALTER TABLE ONLY geoventra.vehicles
    ADD CONSTRAINT vehicles_pkey PRIMARY KEY (id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'schema_migrations_pkey'
          AND conrelid = 'geoventra.schema_migrations'::regclass
    ) THEN
        ALTER TABLE ONLY geoventra.schema_migrations
            ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (id);
    END IF;
END
$$;

ALTER TABLE ONLY geoventra.api_keys
    ADD CONSTRAINT api_keys_key_hash_key UNIQUE (key_hash);

ALTER TABLE ONLY geoventra.devices
    ADD CONSTRAINT devices_device_id_key UNIQUE (device_id);

ALTER TABLE ONLY geoventra.drivers
    ADD CONSTRAINT drivers_organisation_id_license_number_key UNIQUE (organisation_id, license_number);

ALTER TABLE ONLY geoventra.gps_positions
    ADD CONSTRAINT gps_positions_device_id_recorded_at_key UNIQUE (device_id, recorded_at);

ALTER TABLE ONLY geoventra.notification_preferences
    ADD CONSTRAINT notification_preferences_user_id_alert_type_channel_key UNIQUE (user_id, alert_type, channel);

ALTER TABLE ONLY geoventra.organisations
    ADD CONSTRAINT organisations_slug_key UNIQUE (slug);

ALTER TABLE ONLY geoventra.permissions
    ADD CONSTRAINT permissions_code_key UNIQUE (code);

ALTER TABLE ONLY geoventra.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_hash_key UNIQUE (token_hash);

ALTER TABLE ONLY geoventra.retention_config
    ADD CONSTRAINT retention_config_organisation_id_key UNIQUE (organisation_id);

ALTER TABLE ONLY geoventra.roles
    ADD CONSTRAINT roles_organisation_id_name_key UNIQUE (organisation_id, name);

ALTER TABLE ONLY geoventra.service_schedules
    ADD CONSTRAINT service_schedules_vehicle_id_name_key UNIQUE (vehicle_id, name);

ALTER TABLE ONLY geoventra.vehicle_groups
    ADD CONSTRAINT vehicle_groups_organisation_id_name_key UNIQUE (organisation_id, name);

ALTER TABLE ONLY geoventra.vehicles
    ADD CONSTRAINT vehicles_organisation_id_registration_number_key UNIQUE (organisation_id, registration_number);

ALTER TABLE ONLY geoventra.alerts
    ADD CONSTRAINT alerts_acknowledged_by_fkey FOREIGN KEY (acknowledged_by) REFERENCES geoventra.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY geoventra.alerts
    ADD CONSTRAINT alerts_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES geoventra.drivers(id) ON DELETE SET NULL;

ALTER TABLE ONLY geoventra.alerts
    ADD CONSTRAINT alerts_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.alerts
    ADD CONSTRAINT alerts_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES geoventra.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY geoventra.alerts
    ADD CONSTRAINT alerts_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES geoventra.vehicles(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.api_keys
    ADD CONSTRAINT api_keys_created_by_fkey FOREIGN KEY (created_by) REFERENCES geoventra.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY geoventra.api_keys
    ADD CONSTRAINT api_keys_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.audit_logs
    ADD CONSTRAINT audit_logs_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES geoventra.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY geoventra.device_assignments
    ADD CONSTRAINT device_assignments_device_id_fkey FOREIGN KEY (device_id) REFERENCES geoventra.devices(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.device_assignments
    ADD CONSTRAINT device_assignments_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.device_assignments
    ADD CONSTRAINT device_assignments_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES geoventra.vehicles(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.devices
    ADD CONSTRAINT devices_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.drivers
    ADD CONSTRAINT drivers_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.geofence_events
    ADD CONSTRAINT geofence_events_geofence_id_fkey FOREIGN KEY (geofence_id) REFERENCES geoventra.geofences(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.geofence_events
    ADD CONSTRAINT geofence_events_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.geofence_events
    ADD CONSTRAINT geofence_events_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES geoventra.vehicles(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.geofence_vehicles
    ADD CONSTRAINT geofence_vehicles_geofence_id_fkey FOREIGN KEY (geofence_id) REFERENCES geoventra.geofences(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.geofence_vehicles
    ADD CONSTRAINT geofence_vehicles_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.geofence_vehicles
    ADD CONSTRAINT geofence_vehicles_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES geoventra.vehicles(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.geofences
    ADD CONSTRAINT geofences_created_by_fkey FOREIGN KEY (created_by) REFERENCES geoventra.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY geoventra.geofences
    ADD CONSTRAINT geofences_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.gps_positions
    ADD CONSTRAINT gps_positions_device_id_fkey FOREIGN KEY (device_id) REFERENCES geoventra.devices(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.gps_positions
    ADD CONSTRAINT gps_positions_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.gps_positions
    ADD CONSTRAINT gps_positions_trip_fk FOREIGN KEY (trip_id) REFERENCES geoventra.trips(id) ON DELETE SET NULL;

ALTER TABLE ONLY geoventra.gps_positions
    ADD CONSTRAINT gps_positions_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES geoventra.vehicles(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.maintenance_records
    ADD CONSTRAINT maintenance_records_created_by_fkey FOREIGN KEY (created_by) REFERENCES geoventra.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY geoventra.maintenance_records
    ADD CONSTRAINT maintenance_records_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.maintenance_records
    ADD CONSTRAINT maintenance_records_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES geoventra.vehicles(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.notification_preferences
    ADD CONSTRAINT notification_preferences_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.notification_preferences
    ADD CONSTRAINT notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES geoventra.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.refresh_tokens
    ADD CONSTRAINT refresh_tokens_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.refresh_tokens
    ADD CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES geoventra.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.retention_config
    ADD CONSTRAINT retention_config_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.role_permissions
    ADD CONSTRAINT role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES geoventra.permissions(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.role_permissions
    ADD CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES geoventra.roles(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.roles
    ADD CONSTRAINT roles_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.service_schedules
    ADD CONSTRAINT service_schedules_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.service_schedules
    ADD CONSTRAINT service_schedules_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES geoventra.vehicles(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.trip_events
    ADD CONSTRAINT trip_events_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.trip_events
    ADD CONSTRAINT trip_events_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES geoventra.trips(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.trip_events
    ADD CONSTRAINT trip_events_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES geoventra.vehicles(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.trips
    ADD CONSTRAINT trips_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES geoventra.drivers(id) ON DELETE SET NULL;

ALTER TABLE ONLY geoventra.trips
    ADD CONSTRAINT trips_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.trips
    ADD CONSTRAINT trips_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES geoventra.vehicles(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.users
    ADD CONSTRAINT users_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.users
    ADD CONSTRAINT users_role_id_fkey FOREIGN KEY (role_id) REFERENCES geoventra.roles(id) ON DELETE RESTRICT;

ALTER TABLE ONLY geoventra.vehicle_documents
    ADD CONSTRAINT vehicle_documents_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.vehicle_documents
    ADD CONSTRAINT vehicle_documents_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES geoventra.vehicles(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.vehicle_geofence_state
    ADD CONSTRAINT vehicle_geofence_state_geofence_id_fkey FOREIGN KEY (geofence_id) REFERENCES geoventra.geofences(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.vehicle_geofence_state
    ADD CONSTRAINT vehicle_geofence_state_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.vehicle_geofence_state
    ADD CONSTRAINT vehicle_geofence_state_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES geoventra.vehicles(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.vehicle_groups
    ADD CONSTRAINT vehicle_groups_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.vehicle_live_status
    ADD CONSTRAINT vehicle_live_status_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.vehicle_live_status
    ADD CONSTRAINT vehicle_live_status_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES geoventra.vehicles(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.vehicles
    ADD CONSTRAINT vehicles_assigned_driver_id_fkey FOREIGN KEY (assigned_driver_id) REFERENCES geoventra.drivers(id) ON DELETE SET NULL;

ALTER TABLE ONLY geoventra.vehicles
    ADD CONSTRAINT vehicles_group_id_fkey FOREIGN KEY (group_id) REFERENCES geoventra.vehicle_groups(id) ON DELETE SET NULL;

ALTER TABLE ONLY geoventra.vehicles
    ADD CONSTRAINT vehicles_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX alerts_dedupe_unique ON geoventra.alerts USING btree (organisation_id, dedupe_key) WHERE (dedupe_key IS NOT NULL);

CREATE INDEX alerts_org_severity_idx ON geoventra.alerts USING btree (organisation_id, severity, occurred_at DESC);

CREATE INDEX alerts_org_status_idx ON geoventra.alerts USING btree (organisation_id, status, occurred_at DESC);

CREATE INDEX alerts_org_time_idx ON geoventra.alerts USING btree (organisation_id, occurred_at DESC);

CREATE INDEX alerts_vehicle_idx ON geoventra.alerts USING btree (vehicle_id, occurred_at DESC);

CREATE INDEX api_keys_org_idx ON geoventra.api_keys USING btree (organisation_id, created_at DESC);

CREATE INDEX audit_logs_entity_idx ON geoventra.audit_logs USING btree (organisation_id, entity_type, entity_id);

CREATE INDEX audit_logs_org_created_idx ON geoventra.audit_logs USING btree (organisation_id, created_at DESC);

CREATE UNIQUE INDEX device_assignments_active_device ON geoventra.device_assignments USING btree (device_id) WHERE (unassigned_at IS NULL);

CREATE UNIQUE INDEX device_assignments_active_vehicle ON geoventra.device_assignments USING btree (vehicle_id) WHERE (unassigned_at IS NULL);

CREATE INDEX device_assignments_org_idx ON geoventra.device_assignments USING btree (organisation_id, assigned_at DESC);

CREATE UNIQUE INDEX devices_org_id_unique ON geoventra.devices USING btree (organisation_id, id);

CREATE INDEX devices_org_idx ON geoventra.devices USING btree (organisation_id, status);

CREATE INDEX devices_org_imei_idx ON geoventra.devices USING btree (organisation_id, imei);

CREATE UNIQUE INDEX drivers_org_id_unique ON geoventra.drivers USING btree (organisation_id, id);

CREATE INDEX drivers_org_idx ON geoventra.drivers USING btree (organisation_id, status);

CREATE INDEX geofence_events_geofence_idx ON geoventra.geofence_events USING btree (geofence_id, occurred_at DESC);

CREATE INDEX geofence_events_org_time_idx ON geoventra.geofence_events USING btree (organisation_id, occurred_at DESC);

CREATE INDEX geofence_events_vehicle_idx ON geoventra.geofence_events USING btree (vehicle_id, occurred_at DESC);

CREATE INDEX geofence_vehicles_vehicle_idx ON geoventra.geofence_vehicles USING btree (vehicle_id);

CREATE INDEX geofences_center_idx ON geoventra.geofences USING gist (center);

CREATE INDEX geofences_geometry_idx ON geoventra.geofences USING gist (geometry);

CREATE INDEX geofences_org_idx ON geoventra.geofences USING btree (organisation_id, is_active);

CREATE INDEX gps_positions_brin ON geoventra.gps_positions USING brin (recorded_at) WITH (pages_per_range='32');

CREATE INDEX gps_positions_event_idx ON geoventra.gps_positions USING btree (organisation_id, event_id);

CREATE INDEX gps_positions_org_time_idx ON geoventra.gps_positions USING btree (organisation_id, recorded_at DESC);

CREATE INDEX gps_positions_vehicle_time_idx ON geoventra.gps_positions USING btree (vehicle_id, recorded_at DESC);

CREATE INDEX maintenance_records_org_idx ON geoventra.maintenance_records USING btree (organisation_id, performed_at DESC);

CREATE INDEX maintenance_records_vehicle_idx ON geoventra.maintenance_records USING btree (vehicle_id, performed_at DESC);

CREATE INDEX refresh_tokens_user_idx ON geoventra.refresh_tokens USING btree (user_id, expires_at DESC);

CREATE INDEX service_schedules_due_idx ON geoventra.service_schedules USING btree (organisation_id, next_due_at);

CREATE INDEX service_schedules_org_idx ON geoventra.service_schedules USING btree (organisation_id, status);

CREATE INDEX trip_events_org_type_idx ON geoventra.trip_events USING btree (organisation_id, type, occurred_at DESC);

CREATE INDEX trip_events_trip_idx ON geoventra.trip_events USING btree (trip_id, occurred_at);

CREATE INDEX trip_events_vehicle_idx ON geoventra.trip_events USING btree (vehicle_id, occurred_at DESC);

CREATE INDEX trips_driver_started_idx ON geoventra.trips USING btree (driver_id, started_at DESC);

CREATE UNIQUE INDEX trips_one_active_per_vehicle ON geoventra.trips USING btree (vehicle_id) WHERE (status = 'active'::text);

CREATE INDEX trips_org_started_idx ON geoventra.trips USING btree (organisation_id, started_at DESC);

CREATE INDEX trips_org_status_idx ON geoventra.trips USING btree (organisation_id, status);

CREATE INDEX trips_vehicle_started_idx ON geoventra.trips USING btree (vehicle_id, started_at DESC);

CREATE UNIQUE INDEX users_org_email_unique ON geoventra.users USING btree (organisation_id, lower(email)) WHERE (deleted_at IS NULL);

CREATE INDEX users_org_idx ON geoventra.users USING btree (organisation_id, status);

CREATE INDEX vehicle_documents_vehicle_idx ON geoventra.vehicle_documents USING btree (vehicle_id, expires_at);

CREATE INDEX vehicle_geofence_state_vehicle_idx ON geoventra.vehicle_geofence_state USING btree (vehicle_id);

CREATE INDEX vehicle_live_org_status_idx ON geoventra.vehicle_live_status USING btree (organisation_id, status);

CREATE INDEX vehicle_live_recorded_idx ON geoventra.vehicle_live_status USING btree (last_recorded_at DESC);

CREATE INDEX vehicles_org_driver_idx ON geoventra.vehicles USING btree (organisation_id, assigned_driver_id);

CREATE INDEX vehicles_org_group_idx ON geoventra.vehicles USING btree (organisation_id, group_id);

CREATE UNIQUE INDEX vehicles_org_id_unique ON geoventra.vehicles USING btree (organisation_id, id);

CREATE INDEX vehicles_org_status_idx ON geoventra.vehicles USING btree (organisation_id, status);

CREATE FUNCTION geoventra.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER alerts_set_updated_at BEFORE UPDATE ON geoventra.alerts FOR EACH ROW EXECUTE FUNCTION geoventra.set_updated_at();

CREATE TRIGGER devices_set_updated_at BEFORE UPDATE ON geoventra.devices FOR EACH ROW EXECUTE FUNCTION geoventra.set_updated_at();

CREATE TRIGGER drivers_set_updated_at BEFORE UPDATE ON geoventra.drivers FOR EACH ROW EXECUTE FUNCTION geoventra.set_updated_at();

CREATE TRIGGER geofences_set_updated_at BEFORE UPDATE ON geoventra.geofences FOR EACH ROW EXECUTE FUNCTION geoventra.set_updated_at();

CREATE TRIGGER maintenance_records_set_updated_at BEFORE UPDATE ON geoventra.maintenance_records FOR EACH ROW EXECUTE FUNCTION geoventra.set_updated_at();

CREATE TRIGGER notification_preferences_set_updated_at BEFORE UPDATE ON geoventra.notification_preferences FOR EACH ROW EXECUTE FUNCTION geoventra.set_updated_at();

CREATE TRIGGER organisations_set_updated_at BEFORE UPDATE ON geoventra.organisations FOR EACH ROW EXECUTE FUNCTION geoventra.set_updated_at();

CREATE TRIGGER roles_set_updated_at BEFORE UPDATE ON geoventra.roles FOR EACH ROW EXECUTE FUNCTION geoventra.set_updated_at();

CREATE TRIGGER service_schedules_set_updated_at BEFORE UPDATE ON geoventra.service_schedules FOR EACH ROW EXECUTE FUNCTION geoventra.set_updated_at();

CREATE TRIGGER trips_set_updated_at BEFORE UPDATE ON geoventra.trips FOR EACH ROW EXECUTE FUNCTION geoventra.set_updated_at();

CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON geoventra.users FOR EACH ROW EXECUTE FUNCTION geoventra.set_updated_at();

CREATE TRIGGER vehicle_groups_set_updated_at BEFORE UPDATE ON geoventra.vehicle_groups FOR EACH ROW EXECUTE FUNCTION geoventra.set_updated_at();

CREATE TRIGGER vehicle_live_status_set_updated_at BEFORE UPDATE ON geoventra.vehicle_live_status FOR EACH ROW EXECUTE FUNCTION geoventra.set_updated_at();

CREATE TRIGGER vehicles_set_updated_at BEFORE UPDATE ON geoventra.vehicles FOR EACH ROW EXECUTE FUNCTION geoventra.set_updated_at();
