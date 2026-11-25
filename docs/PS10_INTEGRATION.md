# Geoventra — PS10 (Pictor) TCP integration

## 1. What is implemented

- A second TCP listener (`Ps10Service`) alongside PT06, on a separate port (default `5002`).
- GT06-compatible framing: `0x7878` (1-byte length) and `0x7979` (2-byte length) headers,
  CRC-ITU validation, `0x0d0a` stop validation, buffer fragmentation and packet resynchronisation.
- Decoders for login (`0x01`), location (`0x12`), heartbeat (`0x13`), alarm (`0x16` / `0x26`)
  and server-command responses (`0x15`).
- Acknowledgements for login, heartbeat and alarm packets.
- Server command builder (`0x80`) with the correct length field and CRC.
- Connection lifecycle: per-device registration by IMEI, online/offline status, connection
  events, connection health, rate limiting (default 120 packets/minute), connection cap
  (default 200), idle timeout (default 180 s), and masked IMEIs in diagnostics.
- Telemetry is forwarded to `TrackingService.ingest`, so trip detection, geofence evaluation
  and live positions work exactly as for other ingest sources.
- Alarms are written to `device_alarms` and raise deduplicated vehicle alerts when the device
  is assigned to a vehicle.
- Command responses are correlated to `device_commands` by `correlation_id` or
  `payload.serverFlag` and recorded in `device_command_acks`.
- Every packet produces an entry in `device_ingestion_audit` (`source='tcp'`).

## 2. Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PS10_TCP_PORT` / `PS10_PORT` / `PICTOR_TCP_PORT` | `PS10_DEFAULT_TCP_PORT` or `5002` | Listener port |
| `PS10_TCP_HOST` | `TCP_HOST` or `0.0.0.0` | Bind address |
| `PS10_MAX_CONNECTIONS` | `PT06_MAX_CONNECTIONS` or `200` | Concurrent socket limit |
| `PS10_RATE_LIMIT_PER_MINUTE` | `120` | Per-connection packet limit |
| `PS10_TCP_TIMEOUT_MS` | `180000` | Idle socket timeout |

If PS10 and PT06 resolve to the same port, PS10 logs a warning and does not bind; PT06 keeps
the port. See `.env.example`.

## 3. HTTP diagnostics

All three endpoints require a bearer token with the `devices.read` permission:

- `GET /api/v1/ps10/status` — listener state, port, host and connection counts.
- `GET /api/v1/ps10/connections` — connection metadata; IMEIs are masked.
- `GET /api/v1/ps10/packets?limit=50` — most recent packet summaries (max 200).

## 4. Field assumptions (protocol variants)

The decoders follow the documented GT06 layout: 26 bytes of GPS data, an optional ACC byte,
and an optional 4-byte mileage (metres). Coordinates are scaled by `1,800,000` (`30000 × 60`).
Alarm packets place an LBS block after the 26 GPS bytes and before terminal status. Variants
that omit the standalone ACC byte are supported by deriving ACC from the extended course/status
bits (valid + on). Device timestamps are interpreted as UTC; time-zone offsets in the protocol
are not applied.

## 5. Tests

```bash
pnpm --filter @geoventra/api test
pnpm --filter @geoventra/api typecheck
pnpm --filter @geoventra/api build
```

Unit tests cover framing, CRC/stop validation, fragmentation, decoders, ack/command builders
(`ps10.protocol.test.ts`) and the service's registration, ingest, alarm and command-ack paths
(`ps10.service.test.ts`).

## 6. Limitations

- No physical PS10 device packet capture has been supplied; field assumptions in section 4
  are validated only against synthetic frames in the unit tests.
- The protocol's 0..6 voltage level is not a calibrated battery voltage and is deliberately
  not converted into a fake voltage reading.
- Command dispatch (writing `0x80` frames to a live socket) is not yet implemented; inbound
  command responses are correlated, but commands must currently be built with `buildCommand`
  by the transport layer.
- No PS10-specific HTTP device management endpoints were added; existing `/devices` endpoints
  continue to own inventory, configuration and command records.
