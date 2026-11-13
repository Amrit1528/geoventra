-- ==========================================================================
-- Stop detection tables (phase 2).
--
-- Adds the stop detection tables `stops`, `stop_events` and `trip_stops`
-- together with their constraints and lookup indices.
-- ==========================================================================

SET search_path TO geoventra, public;

CREATE TABLE geoventra.stops (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    address text,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone,
    duration_seconds integer DEFAULT 0 NOT NULL,
    is_prolonged boolean DEFAULT false NOT NULL,
    ignition boolean DEFAULT false NOT NULL,
    confirmed_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE geoventra.stop_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    trip_id uuid,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    started_at timestamp with time zone NOT NULL,
    ended_at timestamp with time zone,
    duration_seconds integer DEFAULT 0 NOT NULL,
    is_prolonged boolean DEFAULT false NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE geoventra.trip_stops (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    trip_id uuid NOT NULL,
    stop_id uuid NOT NULL,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    occurred_at timestamp with time zone NOT NULL
);

ALTER TABLE ONLY geoventra.stop_events
    ADD CONSTRAINT stop_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.stops
    ADD CONSTRAINT stops_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.trip_stops
    ADD CONSTRAINT trip_stops_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.stop_events
    ADD CONSTRAINT stop_events_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.stop_events
    ADD CONSTRAINT stop_events_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES geoventra.trips(id) ON DELETE SET NULL;

ALTER TABLE ONLY geoventra.stop_events
    ADD CONSTRAINT stop_events_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES geoventra.vehicles(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.stops
    ADD CONSTRAINT stops_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.stops
    ADD CONSTRAINT stops_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES geoventra.vehicles(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.trip_stops
    ADD CONSTRAINT trip_stops_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.trip_stops
    ADD CONSTRAINT trip_stops_stop_id_fkey FOREIGN KEY (stop_id) REFERENCES geoventra.stops(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.trip_stops
    ADD CONSTRAINT trip_stops_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES geoventra.trips(id) ON DELETE CASCADE;

CREATE INDEX idx_stops_org_confirmed ON geoventra.stops USING btree (organisation_id, confirmed_at DESC);

CREATE INDEX idx_stops_vehicle_start ON geoventra.stops USING btree (vehicle_id, start_time DESC);

CREATE INDEX stop_events_org_time_idx ON geoventra.stop_events USING btree (organisation_id, occurred_at DESC);

CREATE INDEX stop_events_vehicle_time_idx ON geoventra.stop_events USING btree (vehicle_id, occurred_at DESC);

CREATE INDEX stops_confirmed_idx ON geoventra.stops USING btree (organisation_id, confirmed_at DESC);

CREATE INDEX stops_org_vehicle_idx ON geoventra.stops USING btree (organisation_id, vehicle_id);

CREATE INDEX stops_start_time_idx ON geoventra.stops USING btree (organisation_id, start_time DESC);

CREATE UNIQUE INDEX stops_vehicle_date_unique ON geoventra.stops USING btree (organisation_id, vehicle_id);

CREATE INDEX trip_stops_org_idx ON geoventra.trip_stops USING btree (organisation_id);

CREATE INDEX trip_stops_trip_idx ON geoventra.trip_stops USING btree (trip_id);
