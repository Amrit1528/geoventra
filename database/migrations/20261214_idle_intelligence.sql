SET search_path TO geoventra, public;

CREATE TABLE IF NOT EXISTS geoventra.idle_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    device_id uuid,
    driver_id uuid,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone,
    duration_seconds integer,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    resolved_location text,
    ignition_status text,
    detection_method text NOT NULL DEFAULT 'gps',
    event_status text NOT NULL DEFAULT 'open',
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT idle_events_status_check CHECK (event_status = ANY (ARRAY['open'::text, 'closed'::text])),
    CONSTRAINT idle_events_ignition_check CHECK (ignition_status IS NULL OR ignition_status = ANY (ARRAY['on'::text, 'off'::text, 'unknown'::text])),
    CONSTRAINT idle_events_detection_check CHECK (detection_method = ANY (ARRAY['ignition'::text, 'gps'::text]))
);

CREATE INDEX IF NOT EXISTS idle_events_vehicle_start_idx
    ON geoventra.idle_events (organisation_id, vehicle_id, start_time DESC);

CREATE INDEX IF NOT EXISTS idle_events_open_idx
    ON geoventra.idle_events (organisation_id, vehicle_id, event_status) WHERE event_status = 'open';

CREATE TABLE IF NOT EXISTS geoventra.reverse_geocode_cache (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    location_name text NOT NULL,
    provider text NOT NULL DEFAULT 'nominatim',
    cached_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + interval '30 days') NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS reverse_geocode_cache_coord_idx
    ON geoventra.reverse_geocode_cache (round(latitude::numeric, 5), round(longitude::numeric, 5));