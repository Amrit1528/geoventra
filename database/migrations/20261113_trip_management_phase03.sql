-- ==========================================================================
-- Trip Management Phase P0.3 — Trip detection, lifecycle, and history.
--
-- This migration introduces the 'trips' entity to store complete trip records.
-- It reuses existing organisation and vehicle foreign keys.
-- ==========================================================================

SET search_path TO geoventra, public;

-- ── 1. Create Trips Table ─────────────────────────────────────────────────────
CREATE TABLE geoventra.trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL REFERENCES geoventra.organisations(id),
    vehicle_id UUID NOT NULL REFERENCES geoventra.vehicles(id),
    driver_id UUID, -- Nullable if not assigned

    -- Core Trip Data
    status VARCHAR(50) NOT NULL DEFAULT 'active', -- e.g., 'active', 'completed', 'cancelled'
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ended_at TIMESTAMP WITH TIME ZONE,

    -- Location & Tracking
    start_latitude NUMERIC(10, 7) NOT NULL,
    start_longitude NUMERIC(10, 7) NOT NULL,
    end_latitude NUMERIC(10, 7),
    end_longitude NUMERIC(10, 7),

    -- Measurements & Calculations
    distance_km NUMERIC(10, 2) DEFAULT 0.0,
    avg_speed_kph NUMERIC(10, 2) DEFAULT 0.0,
    max_speed_kph NUMERIC(10, 2) DEFAULT 0.0,

    -- Duration Breakdown (seconds)
    duration_seconds INTEGER NOT NULL,
    moving_duration_s INTEGER DEFAULT 0,
    idle_seconds INTEGER DEFAULT 0,
    stopped_duration_s INTEGER DEFAULT 0,

    -- Odometer & Metadata
    start_odometer_km NUMERIC(10, 2),
    end_odometer_km NUMERIC(10, 2),
    detection_source VARCHAR(100), -- e.g., 'ignition', 'movement'
    data_quality_indicators JSONB, -- Store indicators like GPS_SIGNALS breakdown

    -- User-facing labels
    start_label VARCHAR(255),
    destination_label VARCHAR(255),

    -- Auditing
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints and Indexes
    CONSTRAINT fk_trip_organisation FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id),
    CONSTRAINT fk_trip_vehicle FOREIGN KEY (vehicle_id) REFERENCES geoventra.vehicles(id),
    CONSTRAINT fk_trip_driver FOREIGN KEY (driver_id) REFERENCES geoventra.drivers(id),
    UNIQUE (organisation_id, vehicle_id, status) -- Prevents overlapping trips for a vehicle/org combo
);

-- Index for time-series queries (listing/playback)
CREATE INDEX idx_trips_vehicle_time ON geoventra.trips (vehicle_id, started_at DESC);
CREATE INDEX idx_trips_org_time ON geoventra.trips (organisation_id, started_at DESC);

-- ── 2. Update Existing Tracking History (Optional - For cross-reference) ─────
-- No direct changes to gps_positions are required, but we must ensure the new 'trips'
-- table aligns with existing tracking history reads, which it does via vehicle_id and time range.
