# Geoventra — Differentiating Fleet Intelligence Features

## Implemented in this change
- Phase 1: Device adapter registry (manufacturers, models, capabilities, field mappings, integration configs, connection status, ingestion audit) under `/api/v1/device-adapters`.
- Phase 2: Operational intelligence rules and insight events (`/api/v1/insights`) with filters, acknowledgement and resolution.
- Phase 3: Driver/vehicle scorecards with configurable factors and evidence (`/api/v1/scorecards`).
- Phase 4: Maintenance reminders endpoint (`/api/v1/maintenance/reminders`) using existing schedules and certificate expiry.
- Phase 5: Customer delivery tracking links, public read-only view with expiry/revocation and access logging (`/api/v1/delivery`).
- Phase 6: Billing plans/subscriptions/invoices, partners and commissions, tenant branding (`/api/v1/billing`, `/partners`, `/branding`).

## Migrations
- `database/migrations/20261210_differentiating_features.sql` adds required tables and permissions.

## Environment variables
See `.env.example`. New notification variables included previously. No new required vars for these features.

## Known limitations
- Scorecard factors are heuristic and require real telemetry; missing data is not scored as poor.
- ETA for delivery tracking is unavailable unless a routing provider is configured.
- Billing does not process real payments; invoices track status only.
- Predictive AI is not claimed; insights are rule-based.

## Tests
- Integration tests: `apps/api/src/differentiating.integration.test.ts` (6 scenarios).
- Run: `pnpm --filter @geoventra/api test` (Node 20+).
