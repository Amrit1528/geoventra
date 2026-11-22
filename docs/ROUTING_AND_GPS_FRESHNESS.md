# Routing and GPS Freshness Configuration

## Routing

GeoVentra uses an external OSRM-compatible routing service for road distance and ETA.

Set:

- `ROUTING_PROVIDER_URL` — base URL of an OSRM-compatible service, for example `http://localhost:5000`
- `ROUTING_CACHE_TTL_SECONDS` — optional cache TTL in seconds (default: 300)

If `ROUTING_PROVIDER_URL` is not configured, road distance and ETA are reported as unavailable. Straight-line distance remains available and is clearly labeled as straight-line distance. No road distance or ETA is estimated or fabricated.

## GPS Freshness

Effective GPS freshness threshold resolution order:

1. Vehicle-level override (`vehicles.gps_freshness_minutes`)
2. Organization-level setting (`organisations.settings.gpsFreshnessMinutes`)
3. Global default: 15 minutes

Changing a threshold affects current status evaluation and future queries only. Historical GPS records and trip records are never modified.

Admin UI: Administration → GPS freshness threshold.
Vehicle UI: Vehicle details → GPS freshness threshold (inherit or custom).

## Fallback Behavior

- No routing provider: `roadDistanceKm = null`, `etaMinutes = null`, `routeStatus = unavailable`.
- Stale GPS: excluded from nearby vehicle results; classified as offline per existing business rules.
- Missing vehicle/org setting: 15-minute default applies.
