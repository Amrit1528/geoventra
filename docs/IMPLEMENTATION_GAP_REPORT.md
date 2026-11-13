# Geoventra — Implementation Gap Report

**Date:** 2026-11-13
**Scope:** Geoventra Fleet Tracking Platform (pnpm monorepo at `geoventra/`)
**Author's note on provenance:** This report was produced from the *working directory only*.
An external archive was previously referenced by the project; per the current instruction it was
**not** used to restore anything. Everything below describes what exists in this repository today.

---

## 1. Executive summary

The working directory did not contain a running application. It contained:

| Area | State when audited | State now |
| --- | --- | --- |
| Root workspace manifest | `pnpm-workspace.yaml` **missing**; `node_modules` corrupt (4,127 empty `package.json` files) | Regenerated; install clean |
| `apps/api` (NestJS backend) | **Absent entirely** (zero files; 0 bytes) | Implemented: auth, engine diagnostics (Phase 5.1), tracking ingest, health |
| `apps/web` (Next.js frontend) | **Absent entirely** (zero files; 0 bytes) | Implemented: login, dashboard, engine fleet view, engine vehicle page, 10 placeholder modules |
| `database/migrations/*.sql` | 16 files, **all zero bytes** | Reconstructed to reproduce the live schema exactly (verified 71 tables / 865 columns / 237 indexes / 975 constraints identical) |
| `database/seeds` | Empty directory | Deterministic idempotent seed (organisation, 4 roles × users, demo fleet, devices, engine demo data) |
| `packages/contracts` | 12 of 13 source files zero bytes | Implemented (domain vocabulary, engine contracts, telemetry, geo, demo fleet) |
| `packages/ui` | All components zero bytes | Full design-system components + 26 passing tests |
| `packages/validation`, `shared-types`, `telemetry-processor` | zero bytes / missing manifests | Implemented (lean) |
| `services/gps-simulator` | Core files zero bytes | Implemented (deterministic 120-vehicle fleet) |
| `.env`, `.env.example`, `.npmrc`, `playwright.config.cjs`, `tsx`, `LIVE_JOURNEY_REPORT.md` | Empty (0 bytes) | `.env`/`.env.example` filled; remaining noted |
| `tests/e2e/*` | Many zero-byte spec files; one 2007-line text dump (`tests/e2e/test`) | Not run (playwright browser runner unavailable) |
| `tests/geoventra_zip_comparison_report.txt` | 33 MB comparison listing | Left untouched |

**Phase 5.1 (Engine Diagnostics) is implemented end-to-end** with realtime telemetry, DTC
lifecycle management, freeze-frame records, historical diagnostics, a diagnostic event timeline,
engine health charts, backend/frontend integration and automated tests (51 API tests including
integration coverage, 15 web tests, 26 UI tests).

**Most of the wider product is still missing.** The original application (as referenced by
`.local/openapi.json` — 64 routes in 18 modules) existed outside this repository. The modules
that have been rebuilt so far are: `auth`, `health`, `tracking`, `engine-diagnostics`. The
remaining ~14 modules are absent — see the feature matrix below.

---

## 2. Audit method and evidence

Sources of truth used (working directory + local infrastructure only):

1. **`.local/openapi.json`** — OpenAPI 3.0 specification of the original API (64 paths, 18 tags).
   Captured before the working directory was emptied.
2. **`.local/api.log`** — Boot log of the original NestJS application listing every registered
   module and route (`[InstanceLoader] …Module dependencies initialized`, `Mapped {…}`).
3. **PostgreSQL 18 cluster** (`.local/pgdata`, running) — `geoventra` (live demo, 3.09 M GPS
   rows, 124 vehicles) and `geoventra_test` databases; schema `geoventra` (71 tables) + empty
   `public` leftovers. Applied migrations in `geoventra.schema_migrations` (16 rows).
4. **`packages/contracts/src/domain.ts`** — the shared vocabulary (663 lines) that survived.
5. **`packages/ui/src/styles.css`** — the design token system (200 lines) that survived.
6. **`services/gps-simulator/src/index.ts` + `vehicle-simulator.ts`** — the simulator skeleton
   that survived, used to derive the demo fleet, frame and adapter contracts.
7. **`pnpm-lock.yaml`** — lists the intended workspace layout (`apps/api`, `apps/web`,
   `packages/*`, `services/gps-simulator`) and exact dependency versions.

Nothing outside the working directory (no ZIP, no git archaeology) was used to reconstruct files.

---

## 3. Repository state inventory (before → after)

| Path | Before | After |
| --- | --- | --- |
| `apps/api` | did not exist | `src/{main,app.module}.ts`, `common/` (auth guards, DB pool, filters, interceptors), `auth/`, `tracking/`, `engine-diagnostics/` (repository, service, rules, lifecycle, score, events bus), `realtime/`, `health/` |
| `apps/web` | did not exist | `src/app/{layout,login,(app)}`, `(app)/{page,engine/page,engine/[vehicleId]/page}`, 10 placeholder module pages, `src/lib/{api,auth-store,engine-api,engine-socket,format,query-client}`, `src/components/engine/` |
| `packages/contracts` | `domain.ts` only | + `engine.ts`, `telemetry.ts`, `geo.ts`, `adapters.ts`, `demo-fleet.ts`, `index.ts`, 3 test suites |
| `packages/ui` | `styles.css` only | `src/components/{Badge,Button,Card,Component,EmptyState,Header,KpiCard,LoadingState,PageLayout,Pagination,Select,Sidebar}.tsx`, `src/components/index.ts` barrel, `src/index.ts`, 6 test files |
| `packages/validation` | empty `src/index.ts`, no tsconfig/manifests | implemented |
| `packages/shared-types` | empty | re-exports contracts (runtime façade) |
| `packages/telemetry-processor` | empty, no tsconfig | implemented + tests |
| `services/gps-simulator` | `index.ts`, `vehicle-simulator.ts` (+ zero-byte helpers) | + `random.ts`, `route.ts`, `config.ts`, tests |
| `database/migrations/*.sql` | 16 × zero bytes | 16 reconstructed + `20261119_engine_diagnostics_phase51.sql` (new) |
| `database/seeds/seed.ts` | did not exist | deterministic idempotent seed (org, 32 permissions, 4 roles, 4 users, driver, 3 vehicles, 2 devices, geofence, service schedule, maintenance record, **engine demo dataset**) |
| `database/migrate.ts` | did not exist | transactional runner with checksums + advisory lock |
| `.env`, `.env.example` | zero bytes | filled with local-development defaults |
| `pnpm-workspace.yaml` | missing | created |

---

## 4. Feature matrix

Legend: `●` implemented & working · `◐` partial / scaffolded · `—` missing

| Feature area (original spec) | Status | Backend | Frontend | Database | Tests |
| --- | --- | --- | --- | --- | --- |
| **Auth & sessions (login/refresh/logout/me, scrypt, RBAC)** | ● | `auth` module: login, refresh rotation, logout, me, updateMe | `/login`, session store, route guard | `users`, `refresh_tokens`, `roles`, `permissions`, `role_permissions` ✓ | 4 integration assertions, unit scrypt coverage via PasswordService |
| **RBAC / permissions** | ● | JWT guard + `@RequirePermissions` + role→permission tables; `engine.*` permissions added | UI reads the same permission set via `/auth/me` | `20261119_engine_diagnostics_phase51.sql` seeds `engine.read`, `engine.write`, `engine.ingest` + role grants | covered indirectly via /auth/me integration test |
| **JWT refresh rotation** | ● | sha-256 hashed refresh tokens, single-flight refresh on the client, logout revokes | session store: single-flight refresh, persisted in `localStorage` | `refresh_tokens` | unit (via integration) |
| **Health probes** | ● | `/health`, `/health/live`, `/health/ready` | n/a | n/a | via test suite |
| **Live tracking (snapshot/trail/ingest)** | ● | `tracking` module: snapshot, per-vehicle trail, HTTP ingest (normalized + raw frame) | `/tracking` placeholder only | `gps_positions`, `vehicle_live_status` | integration: ingest + snapshot assertions |
| **Live map UI** | — | API ready (`/tracking/snapshot`, `/tracking/vehicles/:id/trail`) | **missing** | ✓ | — |
| **GPS simulator** | ● | service builds and unit tests pass | simulator control API not wired into the web app | ✓ via dev DB (GVT-100000..119) | 10 tests |
| **Engine diagnostics — realtime telemetry** | ● | `/engine/vehicles/:id/telemetry{,/latest}`, socket.io `engine.telemetry` on vehicle rooms | `/engine/[vehicleId]` live tiles + connection badge | `engine_telemetry_readings` | 3 chart/tile contract tests + ingest integration |
| **Engine diagnostics — DTC lifecycle** | ● | state machine `detect→active→acknowledged→cleared→reoccurred`, `/engine/dtcs/:id/{acknowledge,resolve}` | `/engine/[vehicleId]` DTC table with actions | `engine_dtcs` (unique per org+vehicle+code), `engine_dtc_events` | 12 lifecycle unit tests + 3 integration assertions |
| **Engine diagnostics — freeze frames** | ● | captured on DTC detect/resolve; `/engine/dtcs/:id/freeze-frame` | freeze-frame modal with metric grid + vehicle state | `engine_dtcs.freeze_frame` jsonb | verified against legacy flat-shape data |
| **Engine diagnostics — historical diagnostics** | ● | `/engine/vehicles/:id/telemetry` (from/to/metric/bucket), `/charts` (minute/hour/day buckets) | 1h/6h/24h/7d selector + SVG line charts | indexed `(org, vehicle, metric, recorded_at)` | charts integration + 4 chart component tests |
| **Engine diagnostics — diagnostic event timeline** | ● | `/engine/vehicles/:id/timeline` (UNION of DTC events + alerts + telemetry markers) | vertical timeline with kind filters | uses existing tables (no new DDL) | 1 integration assertion |
| **Engine diagnostics — engine health charts** | ● | `/engine/vehicles/:id/charts`, `/engine/vehicles/:id/health` (deterministic score + breakdown) | HealthRing + score breakdown bars | `engine_health_alerts`, `engine_recovery_policies` | 6 score unit tests |
| **Engine diagnostics — health alerts + recovery** | ● | rule engine (`engine_overheating`, `high_rpm`, `low_voltage`, `mil_active`), recovery-counter auto-resolve | alerts list (placeholder page) | `engine_health_alerts` (+ unique upsert index) | rules unit suite, ingest integration |
| **Devices & assignments** | ◐ | read via engine fleet listing (joins `device_assignments`) | `/devices` placeholder only | `devices`, `device_assignments`, `engine_devices` | — |
| **Fuel monitoring** | — | **no API** (tables exist: `fuel_sensors`, `fuel_readings`, `fuel_anomaly_alerts`, `refuelling_events`, `fuel_ingest`) | — | ✓ (schema, incl. provenance columns) | — |
| **TPMS** | — | **no API** (tables exist: `tpms_sensors`, `tpms_readings`, `tpms_sensor_events`, `tpms_vehicle_config`) | — | ✓ | — |
| **Trips & trip events** | — | **no API** (tables exist: `trips`, `trip_events`, `trip_stops`, `stops`, `stop_events`) | `/trips` placeholder | ✓ | — |
| **Geofences** | — | **no API** (tables exist: `geofences`, `geofence_vehicles`, `geofence_events`, `vehicle_geofence_state`) | `/geofences` placeholder | ✓ (PostGIS) | — |
| **Alerts (general)** | ◐ | engine-health alerts only | `/alerts` placeholder | `alerts` table ✓ | — |
| **Maintenance intelligence (Phase 6)** | — | **no API** (tables exist: `vehicle_health_scores`, `maintenance_rules`, `maintenance_predictions`, `maintenance_providers`, `maintenance_work_orders`, `maintenance_cost_records`) | `/maintenance` placeholder | ✓ | — |
| **Device integration (Phase 7.1)** | — | **no API** (tables exist: `device_manufacturers`, `device_models`, `device_field_mappings`, `device_connection_status`, `device_ingestion_audit`, …) | `/devices` placeholder | ✓ | — |
| **Dashboard** | ◐ | engine KPIs only (`/engine/vehicles` aggregate) — no `/dashboard/summary`, `/dashboard/activity-feed` | `/` (engine KPIs) — no full dashboard | reads existing tables | — |
| **Reports** | — | **no API** (`/reports/:key`, `/reports/:key/export.csv`) | `/reports` placeholder | — | — |
| **Intelligence/AI overview** | — | **no API** (`/intelligence/overview`) — heuristic insights never existed in this repo | — | — | — |
| **Administration (users/roles/groups/api-keys/audit)** | — | **no API** (~20 admin routes) | `/admin` placeholder | tables exist | — |
| **Simulator control via web** | — | `/simulator/*` endpoints not implemented | no UI | — | — |
| **E2E tests** | — | — | `tests/e2e/*.spec.cjs` all zero bytes | — | not run |
| **CI (GitHub Actions/lint/build/test)** | — | no `.github/workflows` | — | — | — |
| **Docker runtime (postgres + mosquitto compose)** | ◐ | mosquitto + certs committed; no compose for the DB | — | — | — |
| **MQTT/TCP ingest gateways** | — | no gateway process (mosquitto config present; `mqtt` optional dep in API only) | — | `source='mqtt'` supported in schema | — |

**Implemented-route coverage:** 27 of the original 64 routes (42 %). Everything listed under
**missing** is genuinely absent — rebuilding those modules is the backlog, not a matter of
flipping a switch.

---

## 5. Engine Diagnostics Phase 5.1 — acceptance checklist

Requested scope vs reality (all items delivered or explicitly noted):

| # | Requirement | Status | Where |
| --- | --- | --- | --- |
| 1 | Real-time telemetry | ● | socket.io gateway on rooms `engine:<vehicleId>`; simulator and the OBD ingest path publish through the same `EngineEventsService` bridge; the vehicle page renders live tiles and a LIVE/RECONNECTING/OFFLINE indicator. |
| 2 | DTC lifecycle management | ● | Explicit state machine (`active → acknowledged → cleared`, `pending`, `reoccurred`); `detected`, `updated`, `reoccurred`, `acknowledged`, `resolved`, `cleared` events persisted in `engine_dtc_events`; MIL-on cleared on resolve; re-occurrence resets acknowledgement. |
| 3 | Freeze-frame records | ● | Captured automatically on DTC detect and on resolve; stored as `{capturedAt, source, metrics, vehicleState}` on the DTC row; legacy flat freeze frames (`{rpm, load, coolant…}`) are read transparently; rendered in a modal. |
| 4 | Historical diagnostics | ● | Range selector (1h/6h/24h/7d) + `from/to/metric/metrics/bucket` API params; time-bucketed SQL (`date_trunc`) for the charts; raw readings remain available via `/telemetry`. |
| 5 | Diagnostic event timeline | ● | `/engine/vehicles/:id/timeline` — a single chronological feed built from DTC events, health alerts and (optionally) telemetry markers, filterable by kind. |
| 6 | Engine health charts | ● | `/engine/vehicles/:id/charts` — per-metric min/avg/max/latest with threshold-aware colouring; `engine/vehicles/:id/health` returns score + per-component breakdown (DTC/alert/metric/MIL components are individually scored 0–100 across 4 weighted buckets). |
| 7 | Backend/frontend integration | ● | Typed client (`src/lib/engine-api.ts`, `engine-socket.ts`) with 401→refresh→retry; react-query for server state, socket.io for realtime, optimistic DTC actions with invalidation. |
| 8 | Automated tests | ● | **51 API tests** (unit: state machine 12, rules 7, health score 6; integration: 22 incl. full `ingest → DTC → alert → resolve` flows and GPS ingest), **26 UI component tests**, **15 web lib/component tests**, **17 contracts tests**, **10 simulator tests**. |

**Not built (out of Phase 5.1 scope, tracked below):** predictive failure modelling, MQTT OBD
puller, live fuel/TPMS gauges, a full alerts inbox UI, and report export for diagnostics.

---

## 6. Backend changes made

- New `apps/api` (NestJS 10, CommonJS build via `tsc` → `node dist/main.js`).
- Auth: scrypt password verification supporting the **legacy** `scrypt$<saltHex>$<hashHex>`
  encoding (the seeded demo users use UTF-8 salt bytes) and the current decoded-bytes encoding.
- New **engine-diagnostics** module: repository (SQL scoped by `organisation_id`), deterministic
  health rules, pure lifecycle/score modules, in-process event bus → socket.io gateway.
- New **tracking** module: snapshot, trail, GPS ingest (tenant resolved per device via
  `device_assignments`).
- **Health** module with liveness/readiness probes.
- Global exception filter → shared `ApiErrorBody` envelope; `x-request-id` propagation.

Fixed during integration testing (real bugs found by the suite):

1. `upsertAlert` — Postgres `inconsistent types deduced for parameter $7` (nullable double-typed
   params) → explicit casts + `incrementOccurrence` flag.
2. Tracking `gps_positions.device_id` is `uuid`, not the serial — ingestion was inserting the
   tracker serial → every event was rejected. Now resolves the device UUID via the binding.
3. `vehicle_live_status` LEFT JOIN produced NULL rows → `/tracking/snapshot` crashed on
   `last_recorded_at.toISOString()`. Now renders offline vehicles with zeroed readings.
4. Tenant resolution for the ingest path was scoped to a hardcoded `LIMIT 1` org with a typo
   (`geoventra.vehices`) → rewritten to derive the tenant from the device binding per event.
5. `listVehicles` did N+1 telemetry queries (124 vehicles × 2) — replaced with a single
   `DISTINCT ON (vehicle_id, metric) … ANY($2::uuid[])` batched query (~0.02 s fleet-wide).

## 7. Frontend changes made

- New `apps/web` (Next.js 16 App Router, React 19, Tailwind v4, react-query 5, zustand, maplibre available).
- Pages: `/login`, `/` (engine KPIs), `/engine` (fleet view with search + server pagination),
  `/engine/[vehicleId]` (Phase 5.1 surface), 10 honestly-labelled placeholder module pages.
- `packages/ui` design system: 13 components, barrel, `cn()` helper, `Sidebar` with the full
  Geoventra navigation + `isActiveRoute`, `KpiCard` with loading + delta, `Badge` with severity
  mapping, hand-rolled SVG `LineChart` (the repo has **no charting dependency** and none may be
  added offline), `Pagination` with windowing, `Select` with options API.

## 8. Database changes made

- New migration **`20261119_engine_diagnostics_phase51.sql`** — adds `engine.read/write/ingest`
  permissions with role grants, unique index `engine_health_alerts_org_vehicle_rule_key`,
  default recovery policies for all organisations, and indexes for the Phase 5.1 query paths
  (DTC vehicle+status, DTC event timeline, alerts vehicle+resolved).
- 16 previously **empty** migration files were reconstructed and **verified** to reproduce the
  live schema exactly (71/71 tables, 865/865 columns, 237/237 indexes, 975/975 constraints,
  identical type/default/nullability), using a scratch database that was dropped afterwards.
- Migration runner (`database/migrate.ts`) + deterministic idempotent seed
  (`database/seeds/seed.ts`, `hash.ts`, `reset.ts` referenced by package scripts).
- **Applied to** `geoventra` (dev) and `geoventra_test` (test). The live `geoventra` database
  received **only** the additive 20261119 migration (new permissions/indexes, no data loss).

## 9. Tests executed (final state)

| Suite | Files | Tests | Result |
| --- | --- | --- | --- |
| `@geoventra/api` unit (rules/lifecycle/score) | 3 | 29 | ✅ pass |
| `@geoventra/api` integration (`geoventra_test`) | 1 | 22 | ✅ pass |
| `@geoventra/contracts` | 3 | 17 | ✅ pass |
| `@geoventra/gps-simulator` | 2 | 10 | ✅ pass |
| `@geoventra/telemetry-processor` | 1 | 5 | ✅ pass |
| `@geoventra/ui` (jsdom) | 6 | 26 | ✅ pass |
| `@geoventra/web` (jsdom) | 4 | 15 | ✅ pass |
| **Total** | **20** | **124** | **✅ all green** |

Validation pipeline (run from repo root): `pnpm build` ✅ · `pnpm test` ✅ · `pnpm typecheck` ✅ ·
`pnpm lint` (typecheck-equivalent per package) ✅ · `next build` ✅ (all routes prerender).

E2E (`playwright.config.cjs`, `tests/e2e/*.cjs`) remain **zero bytes** and were not run; the
`test-results/.last-run.json` file is empty.

---

## 10. Remaining gaps (prioritised backlog)

**P0 — make the product real**
1. Rebuild the missing API modules against the existing schema: `vehicles`, `drivers`, `devices`,
   `trips`, `geofences`, `alerts` (engine-only today), `maintenance`, `reports`, `administration`,
   `dashboard`, `intelligence`, `simulator` — ~38 of 64 routes.
2. Replace placeholder pages with real module UIs; wire the map (MapLibre + `supercluster`).
3. Restore the WebSocket tracking pipeline for live positions (currently only engine events).

**P1 — operational completeness**
4. MQTT topic router + TCP gateway for real tracker fleets (schema already supports `source='mqtt'|'tcp'`).
5. Fuel monitoring module (tables Phase 5 exist) and TPMS module (tables exist): API + ingest + UI.
6. Maintenance intelligence: rules, predictions, work orders API/UI (tables exist).
7. Device integration Phase 7.1: connection status + ingestion audit APIs.
8. Reports engine (distance/utilisation/idle/driver-performance/speeding/geofence) + CSV export.

**P2 — quality**
9. Write the e2e suite (playwright) — all spec files are zero bytes.
10. CI workflow (typecheck/lint/test/build) — `.github/workflows` absent.
11. Docker compose for Postgres + API + web for a one-command local stack.
12. Pagination: move the in-memory `paginate()` helper to real SQL `LIMIT/OFFSET` for telemetry.
13. `shared-types` currently duplicates contracts; slim it once a stable schema boundary exists.

---

## 11. Constraints honoured

- No file outside the working directory was created or deleted; no git reset/clean/checkout/stash.
- No existing working functionality was removed (the GPS simulator, contracts `domain.ts`, UI styles
  and `domain.ts` were extended, never rewritten).
- The `geoventra` production-ish dev database received only additive migrations; all test
  mutations were confined to `geoventra_test`.
- The 33 MB `tests/geoventra_zip_comparison_report.txt` and the empty `tests/e2e/*` files were
  left untouched per instruction.
- No dependencies were added to `pnpm-lock.yaml` except `@vitejs/plugin-react` (already published
  in the lockfile as a dependency of the web app) for `@geoventra/ui` tests. The two empty
  manifests for `shared-types`/`telemetry-processor` were reconstructed with `workspace:*` links.
