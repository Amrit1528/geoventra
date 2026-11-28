# Geoventra — Universal Device Compatibility & Telemetry Platform

## 1. Overview

Geoventra supports manufacturer-independent device integration through a layered
architecture. Device-specific code is isolated in protocol adapters; the core
application depends only on normalized telemetry records and the centralized
capability catalogue.

## 2. Architecture

Components:

1. Device Registry — `devices` table and `DevicesService` (`apps/api/src/devices`)
2. Manufacturer / Model Registry — `device_manufacturers`, `device_models` (`device-adapters`)
3. Protocol Registry — PT06 and PS10 TCP listeners plus adapter metadata
4. Protocol Adapter Framework — `DeviceProtocolAdapter` contract (`packages/contracts/src/universal-telemetry.ts`)
5. Telemetry Decoder — PT06/PS10 decoders and `UniversalTelemetryService`
6. Telemetry Normalizer — field mappings (`device_field_mappings`) and `UniversalTelemetryService.ingestRaw`
7. Capability Detection Engine — `device_model_capabilities` + runtime detection during ingest
8. Telemetry Validation Engine — type validation in `UniversalTelemetryService.validateValue`
9. Device Health & Connectivity Monitor — `device_connection_status`, `device_health`
10. Telemetry Storage — `device_telemetry`, `device_sensor_readings`
11. Real-Time Event Publisher — `TrackingEventBus` and socket.io gateways
12. Device Configuration & Diagnostics — `device_configurations`, device detail UI
13. Device Compatibility Dashboard — `/device-adapters` and `/devices/:id`

## 3. Supported device categories

STANDARD_GPS, AIS140, OBD2, CAN_BUS, fuel monitors, TPMS, temperature sensors,
speed governors, driver identification, RFID/iButton, BLE, digital/analog sensors,
vehicle cameras, battery monitors, generic IoT, custom.

## 4. Protocol compatibility

Transports: TCP, UDP, HTTP/HTTPS, REST, MQTT, WebSocket, webhook, serial, RS-485,
CAN gateway, BLE gateway, file import. Direct hardware support is only claimed for
documented protocols (PT06, PS10/GT06-compatible). Gateway-mediated protocols are
labelled as gateway support.

## 5. Universal telemetry model

`UniversalTelemetryRecord` (`packages/contracts/src/universal-telemetry.ts`) includes
tenant, device, vehicle, driver, manufacturer, model, protocol, firmware, capability,
value, unit, source/received timestamps, quality, source type, validation status,
raw packet reference and coordinates.

## 6. Capability catalogue

`UNIVERSAL_CAPABILITY_CATALOG` defines 80+ capabilities across GPS, vehicle, fuel,
engine, TPMS, device health, safety, speed governor, driver and environmental
categories. Each capability defines key, label, category, data type, unit,
description, applicable device types and source.

## 7. Dynamic capability detection

`POST /api/v1/universal-telemetry/ingest/:deviceId` accepts arbitrary payloads.
Fields are mapped via `device_field_mappings`; unmapped fields are stored under
`custom.<field>` and reported as `unknownFields`. Mapped capabilities are recorded
in `device_model_capabilities`. Values are validated and scaled.

## 8. Onboarding

Use `/device-adapters` to create manufacturers/models, declare capabilities, define
field mappings and integration configs. Register physical devices via `/devices`.
Assign devices to vehicles. Telemetry flows through ingest endpoints or TCP
listeners.

## 9. APIs

- `GET /api/v1/universal-telemetry/capabilities`
- `POST /api/v1/universal-telemetry/ingest/:deviceId`
- `GET /api/v1/universal-telemetry/devices/:deviceId/capabilities`
- Existing device APIs under `/api/v1/devices`

## 10. Limitations

- Physical device acceptance requires documented protocol captures.
- Remote commands are not executed automatically; command dispatch is explicit.
- Capability catalogue is static; custom capabilities are stored but not yet promoted
  to first-class definitions.