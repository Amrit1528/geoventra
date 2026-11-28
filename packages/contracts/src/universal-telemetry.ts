/**
 * GEOVENTRA — universal device telemetry and capability contracts.
 *
 * These types define the manufacturer-independent telemetry platform. Adapters
 * decode proprietary packets into `UniversalTelemetryRecord` values; the core
 * application only depends on these normalized records and the capability
 * catalogue below.
 */

export type TelemetryPrimitive = number | boolean | string | null;
export type TelemetryValue = TelemetryPrimitive | Record<string, unknown> | Array<unknown>;

export type TelemetryDataType = 'number' | 'boolean' | 'string' | 'enum' | 'timestamp' | 'json';

export type TelemetryQuality = 'good' | 'suspect' | 'bad' | 'unknown';
export type TelemetryValidationStatus = 'valid' | 'invalid' | 'unmapped' | 'pending';

export type CapabilityState =
  | 'supported'
  | 'active'
  | 'inactive'
  | 'unavailable'
  | 'not_supported'
  | 'pending_configuration'
  | 'invalid_data'
  | 'unknown';

export type DeviceCategory =
  | 'AIS140_VLTD'
  | 'STANDARD_GPS'
  | 'TRACKER_2G'
  | 'TRACKER_3G'
  | 'TRACKER_4G'
  | 'TRACKER_LTE'
  | 'TRACKER_NB_IOT'
  | 'OBD2'
  | 'CAN_BUS'
  | 'FUEL_MONITOR'
  | 'FUEL_LEVEL_SENSOR'
  | 'TPMS'
  | 'TEMPERATURE_SENSOR'
  | 'SPEED_GOVERNOR'
  | 'DRIVER_IDENTIFICATION'
  | 'RFID_IBUTTON'
  | 'BLE_SENSOR'
  | 'DIGITAL_ANALOG_SENSOR'
  | 'VEHICLE_CAMERA'
  | 'BATTERY_MONITOR'
  | 'GENERIC_IOT'
  | 'CUSTOM';

export type TransportType =
  | 'tcp'
  | 'udp'
  | 'http'
  | 'https'
  | 'rest'
  | 'mqtt'
  | 'websocket'
  | 'webhook'
  | 'serial'
  | 'rs485'
  | 'can_gateway'
  | 'ble_gateway'
  | 'file_import';

export interface UniversalTelemetryRecord {
  organisationId: string;
  deviceId: string;
  vehicleId?: string | null;
  driverId?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  protocol?: string | null;
  firmwareVersion?: string | null;
  capability: string;
  value: TelemetryValue;
  unit?: string | null;
  sourceTimestamp: string;
  receivedAt: string;
  quality: TelemetryQuality;
  sourceType: 'device' | 'gateway' | 'integration' | 'simulator';
  validationStatus: TelemetryValidationStatus;
  rawPacketRef?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface CapabilityDefinition {
  key: string;
  label: string;
  category: string;
  dataType: TelemetryDataType;
  unit?: string | null;
  description: string;
  applicableDeviceTypes: DeviceCategory[];
  source: 'device' | 'derived' | 'integration';
  validationRules?: Record<string, unknown>;
}

export interface DeviceProtocolAdapter {
  protocolId: string;
  manufacturer?: string | null;
  supportedModels: string[];
  supportedTransports: TransportType[];
  decodePacket(input: unknown): unknown;
  normalizeTelemetry(input: unknown): UniversalTelemetryRecord[];
  validatePacket(input: unknown): { valid: boolean; reason?: string };
  buildAcknowledgement?(input: unknown): unknown;
  getCapabilities(): string[];
}

export interface TelemetryNormalizationResult {
  accepted: number;
  rejected: number;
  capabilities: string[];
  unknownFields: string[];
  receivedAt: string;
}

/** Central capability catalogue. Extend this list; never remove keys. */
export const UNIVERSAL_CAPABILITY_CATALOG: CapabilityDefinition[] = [
  // GPS / Location
  { key: 'latitude', label: 'Latitude', category: 'gps', dataType: 'number', unit: 'deg', description: 'WGS84 latitude', applicableDeviceTypes: ['STANDARD_GPS', 'AIS140_VLTD', 'GENERIC_IOT'], source: 'device' },
  { key: 'longitude', label: 'Longitude', category: 'gps', dataType: 'number', unit: 'deg', description: 'WGS84 longitude', applicableDeviceTypes: ['STANDARD_GPS', 'AIS140_VLTD', 'GENERIC_IOT'], source: 'device' },
  { key: 'altitude', label: 'Altitude', category: 'gps', dataType: 'number', unit: 'm', description: 'Altitude above sea level', applicableDeviceTypes: ['STANDARD_GPS', 'AIS140_VLTD'], source: 'device' },
  { key: 'gps_speed', label: 'GPS speed', category: 'gps', dataType: 'number', unit: 'km/h', description: 'Speed derived from GPS', applicableDeviceTypes: ['STANDARD_GPS', 'AIS140_VLTD'], source: 'device' },
  { key: 'heading', label: 'Heading', category: 'gps', dataType: 'number', unit: 'deg', description: 'Course over ground', applicableDeviceTypes: ['STANDARD_GPS', 'AIS140_VLTD'], source: 'device' },
  { key: 'satellite_count', label: 'Satellite count', category: 'gps', dataType: 'number', unit: 'count', description: 'Visible satellites', applicableDeviceTypes: ['STANDARD_GPS', 'AIS140_VLTD'], source: 'device' },
  { key: 'gps_accuracy', label: 'GPS accuracy', category: 'gps', dataType: 'number', unit: 'm', description: 'Horizontal accuracy', applicableDeviceTypes: ['STANDARD_GPS', 'AIS140_VLTD'], source: 'device' },
  { key: 'position_valid', label: 'Position validity', category: 'gps', dataType: 'boolean', unit: null, description: 'Whether the position fix is valid', applicableDeviceTypes: ['STANDARD_GPS', 'AIS140_VLTD'], source: 'device' },
  // Vehicle
  { key: 'ignition', label: 'Ignition', category: 'vehicle', dataType: 'boolean', unit: null, description: 'Ignition state', applicableDeviceTypes: ['STANDARD_GPS', 'AIS140_VLTD', 'OBD2', 'CAN_BUS'], source: 'device' },
  { key: 'engine_running', label: 'Engine running', category: 'vehicle', dataType: 'boolean', unit: null, description: 'Engine running state', applicableDeviceTypes: ['OBD2', 'CAN_BUS'], source: 'device' },
  { key: 'vehicle_speed', label: 'Vehicle speed', category: 'vehicle', dataType: 'number', unit: 'km/h', description: 'Speed from vehicle bus', applicableDeviceTypes: ['OBD2', 'CAN_BUS'], source: 'device' },
  { key: 'rpm', label: 'Engine RPM', category: 'vehicle', dataType: 'number', unit: 'rpm', description: 'Engine revolutions per minute', applicableDeviceTypes: ['OBD2', 'CAN_BUS'], source: 'device' },
  { key: 'odometer', label: 'Odometer', category: 'vehicle', dataType: 'number', unit: 'km', description: 'Cumulative distance', applicableDeviceTypes: ['STANDARD_GPS', 'AIS140_VLTD', 'OBD2', 'CAN_BUS'], source: 'device' },
  { key: 'trip_distance', label: 'Trip distance', category: 'vehicle', dataType: 'number', unit: 'km', description: 'Distance for current trip', applicableDeviceTypes: ['STANDARD_GPS', 'AIS140_VLTD'], source: 'derived' },
  { key: 'engine_hours', label: 'Engine hours', category: 'vehicle', dataType: 'number', unit: 'h', description: 'Cumulative engine running hours', applicableDeviceTypes: ['STANDARD_GPS', 'AIS140_VLTD', 'OBD2', 'CAN_BUS'], source: 'device' },
  { key: 'gear', label: 'Gear', category: 'vehicle', dataType: 'string', unit: null, description: 'Selected gear', applicableDeviceTypes: ['OBD2', 'CAN_BUS'], source: 'device' },
  // Fuel
  { key: 'fuel_level', label: 'Fuel level', category: 'fuel', dataType: 'number', unit: '%', description: 'Fuel level percentage', applicableDeviceTypes: ['FUEL_MONITOR', 'FUEL_LEVEL_SENSOR', 'CAN_BUS'], source: 'device' },
  { key: 'fuel_volume', label: 'Fuel volume', category: 'fuel', dataType: 'number', unit: 'L', description: 'Fuel volume', applicableDeviceTypes: ['FUEL_MONITOR', 'FUEL_LEVEL_SENSOR'], source: 'device' },
  { key: 'fuel_consumption', label: 'Fuel consumption', category: 'fuel', dataType: 'number', unit: 'L/100km', description: 'Fuel consumption', applicableDeviceTypes: ['CAN_BUS'], source: 'derived' },
  // Engine / OBD / CAN
  { key: 'coolant_temperature', label: 'Coolant temperature', category: 'engine', dataType: 'number', unit: 'degC', description: 'Engine coolant temperature', applicableDeviceTypes: ['OBD2', 'CAN_BUS'], source: 'device' },
  { key: 'engine_load', label: 'Engine load', category: 'engine', dataType: 'number', unit: '%', description: 'Engine load', applicableDeviceTypes: ['OBD2', 'CAN_BUS'], source: 'device' },
  { key: 'battery_voltage', label: 'Battery voltage', category: 'engine', dataType: 'number', unit: 'V', description: 'Main battery voltage', applicableDeviceTypes: ['STANDARD_GPS', 'AIS140_VLTD', 'OBD2', 'CAN_BUS'], source: 'device' },
  { key: 'intake_temperature', label: 'Intake temperature', category: 'engine', dataType: 'number', unit: 'degC', description: 'Intake air temperature', applicableDeviceTypes: ['OBD2', 'CAN_BUS'], source: 'device' },
  { key: 'oil_pressure', label: 'Oil pressure', category: 'engine', dataType: 'number', unit: 'kPa', description: 'Engine oil pressure', applicableDeviceTypes: ['OBD2', 'CAN_BUS'], source: 'device' },
  { key: 'torque', label: 'Torque', category: 'engine', dataType: 'number', unit: 'Nm', description: 'Engine torque', applicableDeviceTypes: ['CAN_BUS'], source: 'device' },
  { key: 'dtc_code', label: 'DTC code', category: 'engine', dataType: 'string', unit: null, description: 'Diagnostic trouble code', applicableDeviceTypes: ['OBD2', 'CAN_BUS'], source: 'device' },
  // Tyres / TPMS
  { key: 'tyre_pressure', label: 'Tyre pressure', category: 'tpms', dataType: 'number', unit: 'bar', description: 'Tyre pressure', applicableDeviceTypes: ['TPMS'], source: 'device' },
  { key: 'tyre_temperature', label: 'Tyre temperature', category: 'tpms', dataType: 'number', unit: 'degC', description: 'Tyre temperature', applicableDeviceTypes: ['TPMS'], source: 'device' },
  { key: 'tyre_sensor_battery', label: 'TPMS sensor battery', category: 'tpms', dataType: 'number', unit: '%', description: 'TPMS sensor battery level', applicableDeviceTypes: ['TPMS'], source: 'device' },
  // Device health
  { key: 'device_online', label: 'Device online', category: 'device_health', dataType: 'boolean', unit: null, description: 'Device connectivity', applicableDeviceTypes: ['GENERIC_IOT'], source: 'derived' },
  { key: 'gsm_signal', label: 'GSM signal', category: 'device_health', dataType: 'number', unit: 'dBm', description: 'Cellular signal strength', applicableDeviceTypes: ['STANDARD_GPS', 'AIS140_VLTD', 'GENERIC_IOT'], source: 'device' },
  { key: 'network_type', label: 'Network type', category: 'device_health', dataType: 'string', unit: null, description: 'Network type', applicableDeviceTypes: ['STANDARD_GPS', 'AIS140_VLTD', 'GENERIC_IOT'], source: 'device' },
  { key: 'gps_status', label: 'GPS status', category: 'device_health', dataType: 'string', unit: null, description: 'GPS receiver status', applicableDeviceTypes: ['STANDARD_GPS', 'AIS140_VLTD'], source: 'device' },
  { key: 'main_power', label: 'Main power', category: 'device_health', dataType: 'boolean', unit: null, description: 'External power present', applicableDeviceTypes: ['STANDARD_GPS', 'AIS140_VLTD'], source: 'device' },
  { key: 'backup_battery', label: 'Backup battery', category: 'device_health', dataType: 'number', unit: '%', description: 'Backup battery level', applicableDeviceTypes: ['STANDARD_GPS', 'AIS140_VLTD'], source: 'device' },
  { key: 'charging_status', label: 'Charging status', category: 'device_health', dataType: 'string', unit: null, description: 'Charging state', applicableDeviceTypes: ['STANDARD_GPS', 'AIS140_VLTD'], source: 'device' },
  { key: 'tamper_alert', label: 'Tamper alert', category: 'device_health', dataType: 'boolean', unit: null, description: 'Tamper detected', applicableDeviceTypes: ['STANDARD_GPS', 'AIS140_VLTD'], source: 'device' },
  { key: 'firmware_version', label: 'Firmware version', category: 'device_health', dataType: 'string', unit: null, description: 'Firmware version', applicableDeviceTypes: ['GENERIC_IOT'], source: 'device' },
  { key: 'last_communication', label: 'Last communication', category: 'device_health', dataType: 'string', unit: null, description: 'Last communication timestamp', applicableDeviceTypes: ['GENERIC_IOT'], source: 'device' },
  // Safety / AIS-140
  { key: 'panic_sos', label: 'Panic / SOS', category: 'safety', dataType: 'boolean', unit: null, description: 'Emergency button pressed', applicableDeviceTypes: ['AIS140_VLTD', 'STANDARD_GPS'], source: 'device' },
  { key: 'overspeed', label: 'Overspeed', category: 'safety', dataType: 'boolean', unit: null, description: 'Overspeed condition', applicableDeviceTypes: ['AIS140_VLTD', 'STANDARD_GPS'], source: 'device' },
  { key: 'harsh_braking', label: 'Harsh braking', category: 'safety', dataType: 'boolean', unit: null, description: 'Harsh braking event', applicableDeviceTypes: ['STANDARD_GPS', 'OBD2', 'CAN_BUS'], source: 'device' },
  { key: 'harsh_acceleration', label: 'Harsh acceleration', category: 'safety', dataType: 'boolean', unit: null, description: 'Harsh acceleration event', applicableDeviceTypes: ['STANDARD_GPS', 'OBD2', 'CAN_BUS'], source: 'device' },
  { key: 'geofence_alert', label: 'Geofence alert', category: 'safety', dataType: 'boolean', unit: null, description: 'Geofence violation', applicableDeviceTypes: ['STANDARD_GPS', 'AIS140_VLTD'], source: 'device' },
  { key: 'power_disconnect', label: 'Power disconnect', category: 'safety', dataType: 'boolean', unit: null, description: 'Main power disconnected', applicableDeviceTypes: ['STANDARD_GPS', 'AIS140_VLTD'], source: 'device' },
  // Speed governor
  { key: 'governor_speed_limit', label: 'Governor speed limit', category: 'speed_governor', dataType: 'number', unit: 'km/h', description: 'Configured speed limit', applicableDeviceTypes: ['SPEED_GOVERNOR'], source: 'device' },
  { key: 'governor_actual_speed', label: 'Governor actual speed', category: 'speed_governor', dataType: 'number', unit: 'km/h', description: 'Actual speed under governor', applicableDeviceTypes: ['SPEED_GOVERNOR'], source: 'device' },
  { key: 'governor_enabled', label: 'Governor enabled', category: 'speed_governor', dataType: 'boolean', unit: null, description: 'Governor enabled', applicableDeviceTypes: ['SPEED_GOVERNOR'], source: 'device' },
  { key: 'governor_status', label: 'Governor status', category: 'speed_governor', dataType: 'string', unit: null, description: 'Governor status', applicableDeviceTypes: ['SPEED_GOVERNOR'], source: 'device' },
  { key: 'governor_fault', label: 'Governor fault', category: 'speed_governor', dataType: 'boolean', unit: null, description: 'Governor fault', applicableDeviceTypes: ['SPEED_GOVERNOR'], source: 'device' },
  { key: 'governor_tamper', label: 'Governor tamper', category: 'speed_governor', dataType: 'boolean', unit: null, description: 'Governor tamper', applicableDeviceTypes: ['SPEED_GOVERNOR'], source: 'device' },
  // Driver / identification
  { key: 'rfid', label: 'RFID', category: 'driver', dataType: 'string', unit: null, description: 'RFID tag', applicableDeviceTypes: ['DRIVER_IDENTIFICATION', 'RFID_IBUTTON'], source: 'device' },
  { key: 'ibutton', label: 'iButton', category: 'driver', dataType: 'string', unit: null, description: 'iButton id', applicableDeviceTypes: ['DRIVER_IDENTIFICATION', 'RFID_IBUTTON'], source: 'device' },
  { key: 'driver_login', label: 'Driver login', category: 'driver', dataType: 'boolean', unit: null, description: 'Driver logged in', applicableDeviceTypes: ['DRIVER_IDENTIFICATION', 'RFID_IBUTTON'], source: 'device' },
  { key: 'driver_logout', label: 'Driver logout', category: 'driver', dataType: 'boolean', unit: null, description: 'Driver logged out', applicableDeviceTypes: ['DRIVER_IDENTIFICATION', 'RFID_IBUTTON'], source: 'device' },
  { key: 'driver_identification', label: 'Driver identification', category: 'driver', dataType: 'string', unit: null, description: 'Driver identifier', applicableDeviceTypes: ['DRIVER_IDENTIFICATION', 'RFID_IBUTTON'], source: 'device' },
  // Environmental
  { key: 'temperature', label: 'Temperature', category: 'environmental', dataType: 'number', unit: 'degC', description: 'Ambient temperature', applicableDeviceTypes: ['TEMPERATURE_SENSOR', 'BLE_SENSOR'], source: 'device' },
  { key: 'humidity', label: 'Humidity', category: 'environmental', dataType: 'number', unit: '%', description: 'Ambient humidity', applicableDeviceTypes: ['TEMPERATURE_SENSOR', 'BLE_SENSOR'], source: 'device' },
  { key: 'door_status', label: 'Door status', category: 'environmental', dataType: 'boolean', unit: null, description: 'Door open/closed', applicableDeviceTypes: ['DIGITAL_ANALOG_SENSOR'], source: 'device' },
  { key: 'cargo_status', label: 'Cargo status', category: 'environmental', dataType: 'string', unit: null, description: 'Cargo state', applicableDeviceTypes: ['DIGITAL_ANALOG_SENSOR'], source: 'device' },
  { key: 'load_weight', label: 'Load weight', category: 'environmental', dataType: 'number', unit: 'kg', description: 'Cargo weight', applicableDeviceTypes: ['DIGITAL_ANALOG_SENSOR'], source: 'device' },
  { key: 'external_sensor_value', label: 'External sensor value', category: 'environmental', dataType: 'number', unit: null, description: 'Generic external sensor', applicableDeviceTypes: ['DIGITAL_ANALOG_SENSOR', 'GENERIC_IOT'], source: 'device' },
];

export function getCapabilityDefinition(key: string): CapabilityDefinition | undefined {
  return UNIVERSAL_CAPABILITY_CATALOG.find((c) => c.key === key);
}
