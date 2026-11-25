# Geoventra — Pictor Device Integration

## 1. Features implemented in software

- Device inventory, registration, update, delete, enable/disable.
- IMEI validation (Luhn, 15 digits) via `POST /api/v1/devices/validate-imei`.
- Device-to-vehicle assignment, unassignment and replacement workflow.
- Device-to-driver association via existing vehicle/driver links.
- Device activation/deactivation lifecycle and audit logging.
- Online/offline status, last communication timestamp, last GPS fix timestamp.
- Device health, diagnostics, telemetry, alarm, battery history and sensor readings.
- Device configuration management (APN, server host/port, transport mode, intervals, geofence/alarm config).
- Device command queue with pending/sent/acknowledged/failed/expired states.
- Firmware metadata and OTA capability tracking (OTA shown as unsupported where not documented).
- Capability-based sensor/feature profiles for Pictor models.
- TCP gateway for PT06 protocol (existing `Pt06Service`) with login, heartbeat, GPS and alarm packets.
- Capability profiles exposed via `GET /api/v1/devices/pictor-models` and `GET /api/v1/devices/pictor-capabilities`.

## 2. Pictor models supported (capability model only)

See `PICTOR_DEVICE_MODELS` in `apps/api/src/devices/pictor-capabilities.ts`. Models include 4/6/7 PIN trackers, Advanced, OBD, Magnetic Asset, ID Card, YG119, EV, Container E-Lock, T98 dashcams, EDO8R MDVR, CLS2 fuel sensors. Hardware telemetry is marked unsupported until protocol documentation is available.

## 3. Database migrations

- `database/migrations/20261212_pictor_device_integration.sql` adds device_configurations, device_commands, device_command_acks, device_firmware, device_telemetry, device_alarms, device_health, device_battery_history, device_sensor_readings, device_sessions.

## 4. API endpoints added/modified

- `POST /api/v1/devices/validate-imei`
- `GET /api/v1/devices/pictor-models`
- `GET /api/v1/devices/pictor-capabilities`
- `GET/PUT /api/v1/devices/:id/configuration`
- `GET/POST /api/v1/devices/:id/commands`, `PATCH /api/v1/devices/:id/commands/:commandId`, `POST .../ack`
- `GET/PUT /api/v1/devices/:id/firmware`
- `GET/POST /api/v1/devices/:id/telemetry`
- `GET/POST /api/v1/devices/:id/alarms`
- `GET/POST /api/v1/devices/:id/health`
- `GET/POST /api/v1/devices/:id/battery`
- `GET/POST /api/v1/devices/:id/sensors`
- `GET /api/v1/devices/:id/events`

## 5. Frontend

- Device detail page at `/devices/[id]` with overview, configuration, commands, telemetry, battery, sensors and events tabs.
- Existing device inventory page retained.

## 6. Protocols and packet types implemented

- PT06 (existing): login (0x01), heartbeat (0x13), GPS (0x22), alarm (0x26) with CRC-ITU validation.
- PS10 (new): GT06-compatible login (0x01), location (0x12), heartbeat (0x13), alarm (0x16/0x26)
  and command response (0x15) on a separate TCP listener. See `docs/PS10_INTEGRATION.md`.
- All other Pictor models: protocol not documented; capability model only.

## 7. Tests

- IMEI validation unit tests exist in `apps/api/src/devices/imei.util.test.ts`.
- Protocol decoder tests exist for PT06 and PS10 (`apps/api/src/ps10/ps10.protocol.test.ts`).

## 8. Build/lint/type-check

- API typecheck and build pass.

## 9. Hardware tests still required

- Physical Pictor device packet capture and validation.
- TCP gateway load and reconnection tests with real devices.

## 10. Manufacturer documentation still missing

- Packet structures for all Pictor models except PT06.
- Battery/charging field definitions.
- OTA command protocol.
- BLE/RS232/RS485 sensor payload formats.
- Command byte specifications.

## 11. Device adapter registry (multi-brand)

- UI: `/device-adapters` now has tabs for Overview, Manufacturers, Models, Capabilities, Field mappings,
  Integration configs, Connections and Ingestion audit. Create/edit forms are scoped to the current
  organisation; destructive actions require confirmation.
- API: all `/api/v1/device-adapters/*` routes require `devices.read`, with mutations requiring
  `devices.write`. Manufacturers, models, capabilities, field mappings and integration configs support
  list/create/update/delete. Read endpoints accept filters for manufacturer/model, connection status/search
  and audit outcome/source/limit.
- `GET /api/v1/device-adapters/health` returns tenant-scoped registry counts, integration-method counts
  and PT06/PS10 TCP listener status.
- The typed web client lives in `apps/web/src/lib/device-adapters-api.ts`.
- Backend coverage: `device-adapters.service.test.ts` (validation, tenant scoping, filters, health) and
  `device-adapters.controller.test.ts` (all routes).
- UI coverage: `apps/web/src/app/(app)/device-adapters/page.test.tsx` (overview, CRUD forms, toggles and
  filters). The shared web Vitest config has a pre-existing Vite/plugin version mismatch, so this suite uses
  `apps/web/vitest.device-adapters.config.mjs` with a Vitest build backed by Vite 6.

