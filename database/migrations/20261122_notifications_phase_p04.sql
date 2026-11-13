-- ==========================================================================
-- Geofence + automated alerting Phase P0.4 — in-app notifications.
--
-- 1. Creates the `notifications` inbox table. It is deliberately separate from
--    `engine_health_alerts` so an alert can fan out to the user(s) that should be
--    notified without duplicating alert state. `alert_id` is nullable because a
--    notification may also be created for other automation reasons later on.
-- 2. Adds supporting indexes for the unread-count badge and the per-user inbox.
--
-- No existing table or column is dropped or recreated.
-- ==========================================================================

SET search_path TO geoventra, public;

CREATE TABLE IF NOT EXISTS geoventra.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    user_id uuid NOT NULL,
    alert_id uuid,
    alert_type text NOT NULL,
    severity text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    read_at timestamp with time zone,
    CONSTRAINT notifications_severity_check CHECK ((severity = ANY (ARRAY['critical'::text, 'high'::text, 'medium'::text, 'low'::text]))),
    CONSTRAINT notifications_pkey PRIMARY KEY (id),
    CONSTRAINT notifications_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE,
    CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES geoventra.users(id) ON DELETE CASCADE,
    CONSTRAINT notifications_alert_id_fkey FOREIGN KEY (alert_id) REFERENCES geoventra.engine_health_alerts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS notifications_org_user_unread_idx
    ON geoventra.notifications (organisation_id, user_id, created_at DESC)
    WHERE (read = false);

CREATE INDEX IF NOT EXISTS notifications_org_user_read_idx
    ON geoventra.notifications (organisation_id, user_id, read, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_org_severity_created_idx
    ON geoventra.notifications (organisation_id, severity, created_at DESC);
