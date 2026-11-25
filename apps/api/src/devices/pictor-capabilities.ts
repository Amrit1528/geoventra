/** GEOVENTRA — Pictor device capability profiles derived from the product catalogue. */

export interface PictorCapabilityProfile {
  model: string;
  category: string;
  capabilities: string[];
  sensors: string[];
  interfaces: string[];
  batteryType: 'none' | 'backup' | 'standalone';
  chargingTelemetry: boolean;
  batteryTelemetry: boolean;
  otaCapable: boolean;
  notes: string;
}

const COMMON_GPS = ['real_time_tracking', 'trace_playback', 'gps_fix', 'ignition_acc', 'overspeed_alarm', 'geo_fence'];

export const PICTOR_DEVICE_MODELS: PictorCapabilityProfile[] = [
  { model: '4 PIN GPS TRACKER', category: 'standard_gps', capabilities: [...COMMON_GPS, 'driver_behaviour', 'remote_fuel_cut_off', 'geo_fence_alarm', 'light_sensor', 'wire_cut_alert', 'acc_detection'], sensors: ['light'], interfaces: ['wired'], batteryType: 'backup', chargingTelemetry: false, batteryTelemetry: false, otaCapable: false, notes: 'Catalogue lists features only; packet protocol not documented.' },
  { model: '6 PIN GPS TRACKER', category: 'standard_gps', capabilities: [...COMMON_GPS, 'remote_fuel_cut_off', 'door_detection', 'temperature_detection', 'rapid_acceleration'], sensors: ['temperature', 'door'], interfaces: ['wired'], batteryType: 'backup', chargingTelemetry: false, batteryTelemetry: false, otaCapable: false, notes: 'Catalogue lists features only; packet protocol not documented.' },
  { model: '7 PIN GPS TRACKER', category: 'standard_gps', capabilities: [...COMMON_GPS, 'sos', 'mic', 'mileage_data', 'door_detection', 'analog_input', 'dual_server'], sensors: ['analog', 'door'], interfaces: ['wired', 'analog'], batteryType: 'backup', chargingTelemetry: false, batteryTelemetry: false, otaCapable: false, notes: 'Catalogue lists features only; packet protocol not documented.' },
  { model: 'ADVANCED GPS TRACKER', category: 'advanced_gps', capabilities: [...COMMON_GPS, 'sos', 'mic', 'mileage_report', 'g_sensor_3_axis', 'ble_sensor', 'fuel_sensor', 'rs232', 'rs485'], sensors: ['ble', 'fuel', 'temperature', 'pressure'], interfaces: ['rs232', 'rs485', 'ble'], batteryType: 'backup', chargingTelemetry: false, batteryTelemetry: false, otaCapable: false, notes: 'Catalogue lists features only; packet protocol not documented.' },
  { model: 'OBD GPS TRACKER', category: 'obd', capabilities: [...COMMON_GPS, 'mileage_report', 'car_diagnosis', 'plug_and_play', 'fast_positioning'], sensors: ['obd'], interfaces: ['obd'], batteryType: 'backup', chargingTelemetry: false, batteryTelemetry: false, otaCapable: false, notes: 'Catalogue lists features only; packet protocol not documented.' },
  { model: 'MAGNETIC ASSET TRACKER', category: 'asset_tracker', capabilities: ['real_time_tracking', 'trace_playback', 'driver_behaviour', 'light_sensor', 'standalone_battery'], sensors: ['light'], interfaces: ['magnetic'], batteryType: 'standalone', chargingTelemetry: false, batteryTelemetry: true, otaCapable: false, notes: 'Catalogue lists battery capacities 3000/6000/10000 mAh; charging protocol not documented.' },
  { model: 'ID CARD GPS TRACKER', category: 'personal_tracker', capabilities: ['real_time_tracking', 'sos', 'safe_zone', 'voice_calling', 'history_trace', 'push_to_talk', 'dual_way_calls'], sensors: [], interfaces: ['cellular'], batteryType: 'standalone', chargingTelemetry: false, batteryTelemetry: true, otaCapable: false, notes: 'Catalogue lists 2200mAh battery; charging protocol not documented.' },
  { model: 'YG119 Tracker', category: 'pet_tracker', capabilities: ['real_time_tracking', 'geo_fence', 'low_battery_alarm', 'buzzer'], sensors: [], interfaces: ['cellular'], batteryType: 'standalone', chargingTelemetry: false, batteryTelemetry: true, otaCapable: false, notes: 'Catalogue lists pet tracker features; protocol not documented.' },
  { model: 'EV VEHICLE TRACKER', category: 'ev', capabilities: [...COMMON_GPS, 'battery_health', 'theft_control', 'ignition_detection', 'wheel_lock', 'rtos'], sensors: ['ev_battery'], interfaces: ['can'], batteryType: 'backup', chargingTelemetry: false, batteryTelemetry: false, otaCapable: false, notes: 'Catalogue lists EV telemetry features; protocol not documented.' },
  { model: 'CONTAINER E-LOCK', category: 'e_lock', capabilities: ['real_time_tracking', 'multiple_unlock', 'dual_sim', 'low_power'], sensors: ['lock'], interfaces: ['cellular'], batteryType: 'standalone', chargingTelemetry: false, batteryTelemetry: true, otaCapable: false, notes: 'Catalogue lists e-lock features; protocol not documented.' },
  { model: 'T98 DASHCAM', category: 'dashcam', capabilities: ['real_time_tracking', 'video_recording', 'adas', 'dms', 'g_sensor_3_axis', 'two_way_voice', 'collision_alarm'], sensors: ['g_sensor', 'camera'], interfaces: ['cellular', 'wifi'], batteryType: 'backup', chargingTelemetry: false, batteryTelemetry: false, otaCapable: false, notes: 'Catalogue lists multiple T98 variants; protocol not documented.' },
  { model: 'EDO8R MDVR', category: 'mdvr', capabilities: ['real_time_tracking', 'video_recording_8ch', 'adas', 'dms', 'blind_spot_detection', 'history_video_playback'], sensors: ['camera'], interfaces: ['cellular', 'wifi'], batteryType: 'backup', chargingTelemetry: false, batteryTelemetry: false, otaCapable: false, notes: 'Catalogue lists MDVR features; protocol not documented.' },
  { model: 'CLS2 FUEL SENSOR', category: 'fuel_sensor', capabilities: ['fuel_level', 'calibration', 'temperature_range', 'ip_rated'], sensors: ['fuel'], interfaces: ['bluetooth', 'analog', 'rs485'], batteryType: 'none', chargingTelemetry: false, batteryTelemetry: false, otaCapable: false, notes: 'Catalogue lists CLS2 variants; protocol not documented.' },
];

export function getPictorModel(name: string): PictorCapabilityProfile | undefined {
  return PICTOR_DEVICE_MODELS.find((m) => m.model.toLowerCase() === name.toLowerCase());
}

export function supportsCapability(model: string, capability: string): boolean {
  const profile = getPictorModel(model);
  return !!profile && profile.capabilities.includes(capability);
}
