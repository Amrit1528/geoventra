-- ==========================================================================
-- Fleet feature tables (phase 3).
--
-- Adds the fleet feature tables: fuel_ingest, driver_behavior,
-- driver_work_hours_summary, expense_categories, expenses, video_telematics and
-- vehicle_location_events, plus the `expense_summary` reporting view.
-- ==========================================================================

SET search_path TO geoventra, public;

CREATE TABLE geoventra.fuel_ingest (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    fuel_level numeric(8,2) NOT NULL,
    fuel_capacity numeric(8,2),
    fuel_type text,
    road_temps_c numeric(5,2),
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fuel_ingest_fuel_level_check CHECK ((fuel_level >= (0)::numeric))
);

CREATE TABLE geoventra.driver_behavior (
    driver_id uuid NOT NULL,
    organisation_id uuid NOT NULL,
    harsh_braking_count integer DEFAULT 0 NOT NULL,
    overspeeding_count integer DEFAULT 0 NOT NULL,
    idling_time_minutes numeric(8,2) DEFAULT 0 NOT NULL,
    sudden_acceleration_count integer DEFAULT 0 NOT NULL,
    avg_speed_kph numeric(6,2) DEFAULT 0 NOT NULL,
    max_speed_kph numeric(6,2) DEFAULT 0 NOT NULL,
    last_updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE geoventra.driver_work_hours_summary (
    driver_id uuid NOT NULL,
    organisation_id uuid NOT NULL,
    total_hours numeric(8,2) DEFAULT 0 NOT NULL,
    active_sessions integer DEFAULT 0 NOT NULL,
    last_session_started timestamp with time zone
);

CREATE TABLE geoventra.expense_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE geoventra.expenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    vehicle_id uuid,
    driver_id uuid,
    category_id uuid,
    amount numeric(12,2) NOT NULL,
    expense_type text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    approved boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT expenses_amount_check CHECK ((amount >= (0)::numeric)),
    CONSTRAINT expenses_expense_type_check CHECK ((expense_type = ANY (ARRAY['fuel'::text, 'maintenance'::text, 'repair'::text, 'toll'::text, 'insurance'::text, 'other'::text])))
);

CREATE TABLE geoventra.video_telematics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    vehicle_id uuid,
    device_id uuid,
    camera_type text NOT NULL,
    file_url text NOT NULL,
    thumbnail_url text,
    event_type text NOT NULL,
    file_size numeric(12,2) DEFAULT 0 NOT NULL,
    duration_seconds integer DEFAULT 0 NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT video_telematics_camera_type_check CHECK ((camera_type = ANY (ARRAY['front'::text, 'rear'::text, 'interior'::text, 'side_left'::text, 'side_right'::text, 'external'::text])))
);

CREATE TABLE geoventra.vehicle_location_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    trip_id uuid,
    label text NOT NULL,
    locality text,
    sublocality text,
    neighbourhood text,
    road text,
    city text,
    district text,
    state text,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    "position" public.geography(Point,4326),
    recorded_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY geoventra.driver_behavior
    ADD CONSTRAINT driver_behavior_pkey PRIMARY KEY (driver_id);

ALTER TABLE ONLY geoventra.driver_work_hours_summary
    ADD CONSTRAINT driver_work_hours_summary_pkey PRIMARY KEY (driver_id);

ALTER TABLE ONLY geoventra.expense_categories
    ADD CONSTRAINT expense_categories_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.fuel_ingest
    ADD CONSTRAINT fuel_ingest_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.vehicle_location_events
    ADD CONSTRAINT vehicle_location_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.video_telematics
    ADD CONSTRAINT video_telematics_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.expense_categories
    ADD CONSTRAINT expense_categories_organisation_id_name_key UNIQUE (organisation_id, name);

ALTER TABLE ONLY geoventra.driver_behavior
    ADD CONSTRAINT driver_behavior_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES geoventra.drivers(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.driver_behavior
    ADD CONSTRAINT driver_behavior_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.driver_work_hours_summary
    ADD CONSTRAINT driver_work_hours_summary_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES geoventra.drivers(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.driver_work_hours_summary
    ADD CONSTRAINT driver_work_hours_summary_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.expense_categories
    ADD CONSTRAINT expense_categories_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.expenses
    ADD CONSTRAINT expenses_category_id_fkey FOREIGN KEY (category_id) REFERENCES geoventra.expense_categories(id) ON DELETE SET NULL;

ALTER TABLE ONLY geoventra.expenses
    ADD CONSTRAINT expenses_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES geoventra.drivers(id) ON DELETE SET NULL;

ALTER TABLE ONLY geoventra.expenses
    ADD CONSTRAINT expenses_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.expenses
    ADD CONSTRAINT expenses_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES geoventra.vehicles(id) ON DELETE SET NULL;

ALTER TABLE ONLY geoventra.fuel_ingest
    ADD CONSTRAINT fuel_ingest_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.fuel_ingest
    ADD CONSTRAINT fuel_ingest_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES geoventra.vehicles(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.vehicle_location_events
    ADD CONSTRAINT vehicle_location_events_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.vehicle_location_events
    ADD CONSTRAINT vehicle_location_events_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES geoventra.trips(id) ON DELETE SET NULL;

ALTER TABLE ONLY geoventra.vehicle_location_events
    ADD CONSTRAINT vehicle_location_events_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES geoventra.vehicles(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.video_telematics
    ADD CONSTRAINT video_telematics_device_id_fkey FOREIGN KEY (device_id) REFERENCES geoventra.devices(id) ON DELETE SET NULL;

ALTER TABLE ONLY geoventra.video_telematics
    ADD CONSTRAINT video_telematics_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.video_telematics
    ADD CONSTRAINT video_telematics_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES geoventra.vehicles(id) ON DELETE CASCADE;

CREATE INDEX driver_behavior_org_idx ON geoventra.driver_behavior USING btree (organisation_id);

CREATE INDEX driver_work_hours_org_idx ON geoventra.driver_work_hours_summary USING btree (organisation_id);

CREATE INDEX expenses_org_time_idx ON geoventra.expenses USING btree (organisation_id, created_at DESC);

CREATE INDEX expenses_org_type_idx ON geoventra.expenses USING btree (organisation_id, expense_type);

CREATE INDEX expenses_vehicle_idx ON geoventra.expenses USING btree (vehicle_id, created_at DESC);

CREATE INDEX vehicle_location_events_trip_idx ON geoventra.vehicle_location_events USING btree (trip_id, recorded_at);

CREATE INDEX vehicle_location_events_vehicle_idx ON geoventra.vehicle_location_events USING btree (organisation_id, vehicle_id, recorded_at DESC);

CREATE INDEX video_telematics_org_time_idx ON geoventra.video_telematics USING btree (organisation_id, recorded_at DESC);

CREATE INDEX video_telematics_vehicle_time_idx ON geoventra.video_telematics USING btree (vehicle_id, recorded_at DESC);

CREATE VIEW geoventra.expense_summary AS
 SELECT e.organisation_id,
    e.category_id,
    COALESCE(c.name, 'Uncategorised'::text) AS category_name,
    sum(e.amount) AS total_amount,
    (count(*))::integer AS total_expenses
   FROM (geoventra.expenses e
     LEFT JOIN geoventra.expense_categories c ON ((c.id = e.category_id)))
  GROUP BY e.organisation_id, e.category_id, COALESCE(c.name, 'Uncategorised'::text);
