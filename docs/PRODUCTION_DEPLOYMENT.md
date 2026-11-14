# Geoventra — Production Deployment & Operations

**Product:** Geoventra — Intelligent Tracking Mantra  
**Date:** 2026-11-14

## 1. Environment configuration

Configure secrets and environment-specific values via environment variables (`.env` for local/dev, secret manager in production). Never commit real secrets.

Key variables:

- `NODE_ENV=production`
- `PORT` (API, default 4000), web port 3000
- `DATABASE_URL` (PostgreSQL/PostGIS connection string)
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (strong, rotated secrets)
- `CORS_ORIGIN` (comma-separated allowed origins)
- `NEXT_PUBLIC_API_BASE_URL` (web → API base, e.g. `https://api.example.com/api/v1`)
- `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX` (API throttling)
- `REQUEST_BODY_LIMIT` (default 1mb)
- Device/telemetry integration secrets as required by adapters (MQTT/TCP credentials, API keys)

## 2. Database & migrations

- Database: PostgreSQL with PostGIS (`geoventra` schema).
- Migrations live in `database/migrations/*.sql` and are applied in order.
- Run migrations before starting the API: `pnpm db:migrate` (or `database/migrate.ts` runner).
- Seed/demo data: `pnpm db:seed` (development/staging only).
- Backup & recovery: schedule regular logical backups (`pg_dump -Fc`) and WAL archiving/PITR where required; verify restore procedures in staging; retain backups according to policy.

## 3. Build & run

```bash
pnpm install
pnpm --filter @geoventra/contracts build
pnpm --filter @geoventra/ui build
pnpm --filter @geoventra/api build
pnpm --filter @geoventra/web build

pnpm --filter @geoventra/api start   # serves /api/v1 and /health*
pnpm --filter @geoventra/web start   # Next.js production server
```

Docker (local/prod-like): `docker compose up -d` uses `docker-compose.yml` (PostGIS + API + Web). Replace the dev-style command with immutable images/Dockerfiles for production.

## 4. Security & access control

- Authentication: JWT access/refresh tokens with rotation; scrypt password hashing.
- Authorization: role-based permissions enforced by guards (`@RequirePermissions`) on API routes; UI respects permissions from session/profile.
- Transport: terminate TLS at ingress/load balancer; enforce HTTPS; set strict CORS origins.
- API hardening: request body limits, security headers (nosniff, frame/referrer/permissions policies), and in-process rate limiting enabled in API bootstrap (configure `RATE_LIMIT_*`; use a distributed limiter, e.g. Redis, for multi-instance deployments).
- Input validation: Zod/class validation on API inputs; parameterized SQL queries throughout services.
- Secrets: store in a secret manager/KMS; rotate regularly; never log secrets or raw credentials.

## 5. Telemetry, realtime & background processing

- GPS/telemetry ingestion: `POST /api/v1/tracking/ingest` (and module-specific ingest endpoints such as TPMS/fuel/engine/device paths) with authenticated device/API-key flows as configured.
- Realtime: Socket.IO gateways publish tracking/engine updates to subscribed clients; clients fall back to polling where websocket connectivity is unavailable.
- Background/event processing: trip detection and geofence evaluation run on ingest; for high-throughput production, move ingestion fan-out, alerting, maintenance evaluation and report aggregation to durable queues/workers.
- Device integrations: extensible device-to-vehicle mapping and telemetry ingestion interfaces exist; protocol adapters (GPS/AIS-140/fuel/TPMS/OBD/temperature) should be added per manufacturer/device profile without core rewrites.

## 6. Observability & reliability

- Health checks: `GET /health`, `/health/live`, `/health/ready` (readiness verifies database connectivity).
- Logging: structured application logs with request IDs; forward to centralized logging (ELK/CloudWatch/etc.) in production.
- Monitoring: track API latency/error rates, DB connections, ingest throughput, websocket connections, queue depth, and device last-seen/offline rates.
- Error handling: global exception filter returns consistent error envelopes; clients handle loading/empty/offline/error states.
- Notifications: alert/notification infrastructure persisted in DB; wire external channels (email/SMS/push) via provider integrations and user preferences for production delivery.

## 7. Operational runbook

- **Migrations:** apply before deploy; verify schema compatibility.
- **Rollback:** keep previous app image/build; DB rollbacks require tested down strategies/backups.
- **Device connectivity:** monitor `last_communication_at`/status; investigate offline devices, auth failures, and ingest validation errors.
- **Data integrity:** do not fabricate telemetry; unavailable sensor values must remain unavailable until devices report.
- **Scaling:** stateless API/web replicas behind load balancer; shared Postgres; externalize rate limiting, sessions/queues, and socket presence for horizontal scale.
