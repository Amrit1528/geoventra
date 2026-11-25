/** GEOVENTRA — common device protocol adapter interfaces. */

export interface DeviceCapabilityProfile {
  model: string;
  capabilities: string[];
  sensors: string[];
  interfaces: string[];
  batteryTelemetry: boolean;
  chargingTelemetry: boolean;
  otaCapable: boolean;
}

export interface DevicePacketDecoder<T = unknown> {
  decode(buffer: Buffer): T | null;
}

export interface DeviceCommandEncoder {
  encode(commandType: string, payload: Record<string, unknown>): Buffer | null;
}

export interface DeviceConfigurationAdapter {
  toDeviceConfig(input: Record<string, unknown>): Record<string, unknown>;
  fromDeviceConfig(raw: Record<string, unknown>): Record<string, unknown>;
}

export interface DeviceProtocolAdapter {
  manufacturer: string;
  protocol: string;
  firmwareVersions: string[];
  capabilities: DeviceCapabilityProfile;
  decoder: DevicePacketDecoder;
  encoder: DeviceCommandEncoder;
  configuration: DeviceConfigurationAdapter;
  supports(commandType: string): boolean;
}

export class UnsupportedDeviceProtocolAdapter implements DeviceProtocolAdapter {
  constructor(public readonly manufacturer = 'unknown', public readonly protocol = 'unknown') {}
  firmwareVersions: string[] = [];
  capabilities: DeviceCapabilityProfile = {
    model: 'unknown',
    capabilities: [],
    sensors: [],
    interfaces: [],
    batteryTelemetry: false,
    chargingTelemetry: false,
    otaCapable: false,
  };
  decoder: DevicePacketDecoder = { decode: () => null };
  encoder: DeviceCommandEncoder = { encode: () => null };
  configuration: DeviceConfigurationAdapter = {
    toDeviceConfig: (input) => input,
    fromDeviceConfig: (raw) => raw,
  };
  supports() { return false; }
}
