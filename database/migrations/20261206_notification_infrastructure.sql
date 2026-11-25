-- ==========================================================================
-- Notification infrastructure Phase N — persistent queue, credentials,
-- webhooks, device tokens.
-- ==========================================================================

SET search_path TO geoventra, public;

-- ── Persistent notification queue ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS geoventra.notification_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    idempotency_key text NOT NULL,
    channel text NOT NULL,
    provider text NOT NULL,
    recipient jsonb NOT NULL DEFAULT '{}'::jsonb,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    status text NOT NULL DEFAULT 'PENDING',
    attempts integer NOT NULL DEFAULT 0,
    max_attempts integer NOT NULL DEFAULT 5,
    next_run_at timestamp with time zone NOT NULL DEFAULT now(),
    scheduled_at timestamp with time zone NOT NULL DEFAULT now(),
    locked_at timestamp with time zone,
    locked_by text,
    last_error text,
    provider_message_id text,
    simulated boolean NOT NULL DEFAULT false,
    priority integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    delivered_at timestamp with time zone,
    dead_lettered_at timestamp with time zone,
    CONSTRAINT notification_queue_pkey PRIMARY KEY (id),
    CONSTRAINT notification_queue_status_check CHECK (status IN ('PENDING','PROCESSING','DELIVERED','RETRY','DEAD_LETTER','SIMULATED')),
    CONSTRAINT notification_queue_channel_check CHECK (channel IN ('email','sms','push','in_app')),
    CONSTRAINT notification_queue_org_idempotency_uq UNIQUE (organisation_id, idempotency_key),
    CONSTRAINT notification_queue_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS notification_queue_status_next_run_idx
    ON geoventra.notification_queue (status, next_run_at, priority DESC);
CREATE INDEX IF NOT EXISTS notification_queue_org_status_created_idx
    ON geoventra.notification_queue (organisation_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS notification_queue_org_created_idx
    ON geoventra.notification_queue (organisation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notification_queue_locked_at_idx
    ON geoventra.notification_queue (locked_at) WHERE status = 'PROCESSING';

-- ── Transactional outbox ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS geoventra.notification_outbox (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    event_type text NOT NULL,
    aggregate_type text,
    aggregate_id text,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    status text NOT NULL DEFAULT 'PENDING',
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    processed_at timestamp with time zone,
    error text,
    CONSTRAINT notification_outbox_pkey PRIMARY KEY (id),
    CONSTRAINT notification_outbox_status_check CHECK (status IN ('PENDING','PROCESSED','FAILED')),
    CONSTRAINT notification_outbox_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS notification_outbox_status_created_idx
    ON geoventra.notification_outbox (status, created_at);

-- ── Provider credentials (encrypted at rest) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS geoventra.provider_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    provider text NOT NULL,
    channel text NOT NULL,
    encrypted_config text NOT NULL,
    key_version integer NOT NULL DEFAULT 1,
    status text NOT NULL DEFAULT 'not_configured',
    verified_at timestamp with time zone,
    last_error text,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT provider_credentials_pkey PRIMARY KEY (id),
    CONSTRAINT provider_credentials_status_check CHECK (status IN ('not_configured','configured','verified','degraded','disabled','error')),
    CONSTRAINT provider_credentials_org_provider_uq UNIQUE (organisation_id, provider),
    CONSTRAINT provider_credentials_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS provider_credentials_org_idx ON geoventra.provider_credentials (organisation_id);

-- ── Credential change audit history ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS geoventra.credential_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    credential_id uuid,
    provider text NOT NULL,
    action text NOT NULL,
    actor_user_id uuid,
    changes jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT credential_audit_logs_pkey PRIMARY KEY (id),
    CONSTRAINT credential_audit_logs_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS credential_audit_logs_org_created_idx
    ON geoventra.credential_audit_logs (organisation_id, created_at DESC);

-- ── Webhook events (dedup + history) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS geoventra.webhook_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider text NOT NULL,
    event_type text,
    external_id text,
    dedupe_key text NOT NULL,
    organisation_id uuid,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    signature_valid boolean,
    status text NOT NULL DEFAULT 'received',
    error text,
    received_at timestamp with time zone NOT NULL DEFAULT now(),
    processed_at timestamp with time zone,
    CONSTRAINT webhook_events_pkey PRIMARY KEY (id),
    CONSTRAINT webhook_events_status_check CHECK (status IN ('received','processed','duplicate','failed','rejected')),
    CONSTRAINT webhook_events_dedupe_uq UNIQUE (dedupe_key)
);
CREATE INDEX IF NOT EXISTS webhook_events_provider_received_idx
    ON geoventra.webhook_events (provider, received_at DESC);
CREATE INDEX IF NOT EXISTS webhook_events_org_received_idx
    ON geoventra.webhook_events (organisation_id, received_at DESC);

-- ── Push device tokens ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS geoventra.push_device_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    user_id uuid,
    device_token text NOT NULL,
    platform text NOT NULL DEFAULT 'android',
    active boolean NOT NULL DEFAULT true,
    invalid_reason text,
    invalidated_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT push_device_tokens_pkey PRIMARY KEY (id),
    CONSTRAINT push_device_tokens_org_token_uq UNIQUE (organisation_id, device_token),
    CONSTRAINT push_device_tokens_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS push_device_tokens_org_active_idx
    ON geoventra.push_device_tokens (organisation_id, active);

-- ── Notification delivery analytics view (optional) ──────────────────────────
CREATE OR REPLACE VIEW geoventra.notification_delivery_stats AS
SELECT organisation_id, provider, channel, status, COUNT(*)::int AS count
FROM geoventra.notification_queue
GROUP BY organisation_id, provider, channel, status;