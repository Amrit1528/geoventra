/**
 * GEOVENTRA — realtime engine socket.
 *
 * A single socket.io connection shared by the whole application. The engine
 * pages subscribe to a vehicle room and receive `engine.telemetry`,
 * `engine.dtc`, `engine.alert` and `engine.health` events.
 *
 * The module also tracks the connection state so the UI can render an honest
 * LIVE / RECONNECTED / OFFLINE indicator.
 */

import { io, type Socket } from 'socket.io-client';
import {
  engineVehicleRoom,
  type EngineAlertEventPayload,
  type EngineDtcEventPayload,
  type EngineHealthEventPayload,
  type EngineRealtimeEventName,
  type EngineTelemetryEvent,
} from '@geoventra/contracts';
import { WS_BASE_URL } from './api';

/** Connection state of the realtime channel. */
export type EngineSocketStatus = 'idle' | 'connecting' | 'live' | 'reconnected' | 'reconnecting' | 'offline';

/** Payload type of every realtime engine event. */
export interface EngineEventMap {
  'engine.telemetry': EngineTelemetryEvent;
  'engine.dtc': EngineDtcEventPayload;
  'engine.alert': EngineAlertEventPayload;
  'engine.health': EngineHealthEventPayload;
}

/** Room name a vehicle's events are published to. */
export function engineRoomFor(vehicleId: string): string {
  return engineVehicleRoom(vehicleId);
}

let socket: Socket | null = null;
let status: EngineSocketStatus = 'idle';
let hasConnectedBefore = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

const subscribedVehicles = new Set<string>();
const statusListeners = new Set<(status: EngineSocketStatus) => void>();

function setStatus(next: EngineSocketStatus): void {
  if (status === next) return;
  status = next;
  for (const listener of statusListeners) listener(next);
}

function clearReconnectTimer(): void {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function emitSubscriptions(): void {
  if (!socket) return;
  for (const vehicleId of subscribedVehicles) {
    socket.emit('engine:subscribe', { vehicleId });
  }
}

/** Create (or return) the shared socket.io connection. */
export function getEngineSocket(): Socket {
  if (socket) return socket;

  socket = io(WS_BASE_URL, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
  });

  socket.on('connect', () => {
    const reconnected = hasConnectedBefore;
    hasConnectedBefore = true;
    clearReconnectTimer();
    setStatus(reconnected ? 'reconnected' : 'live');
    // Rooms do not survive a reconnect — re-join them.
    emitSubscriptions();
    reconnectTimer = setTimeout(() => setStatus('live'), 8000);
  });

  socket.on('disconnect', () => {
    clearReconnectTimer();
    setStatus('offline');
  });

  socket.on('connect_error', () => {
    clearReconnectTimer();
    setStatus('reconnecting');
  });

  socket.io.on('reconnect_attempt', () => {
    setStatus('reconnecting');
  });

  return socket;
}

/** Open the realtime connection (idempotent). */
export function connectEngineSocket(): Socket {
  const instance = getEngineSocket();
  if (!instance.connected) {
    setStatus(status === 'idle' ? 'connecting' : status);
    instance.connect();
  }
  return instance;
}

/** Close the realtime connection and forget every subscription. */
export function disconnectEngineSocket(): void {
  clearReconnectTimer();
  subscribedVehicles.clear();
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }
  socket = null;
  hasConnectedBefore = false;
  setStatus('idle');
}

/** Join the realtime room of a vehicle. */
export function subscribeToVehicle(vehicleId: string): void {
  subscribedVehicles.add(vehicleId);
  const instance = connectEngineSocket();
  if (instance.connected) {
    instance.emit('engine:subscribe', { vehicleId });
  }
}

/** Leave the realtime room of a vehicle. */
export function unsubscribeFromVehicle(vehicleId: string): void {
  subscribedVehicles.delete(vehicleId);
  if (socket?.connected) {
    socket.emit('engine:unsubscribe', { vehicleId });
  }
}

/** Currently subscribed vehicle ids (used by tests and diagnostics). */
export function getSubscribedVehicles(): string[] {
  return Array.from(subscribedVehicles);
}

/** Current connection status. */
export function getEngineSocketStatus(): EngineSocketStatus {
  return status;
}

/** Subscribe to connection status changes; returns an unsubscribe function. */
export function onEngineSocketStatus(handler: (status: EngineSocketStatus) => void): () => void {
  statusListeners.add(handler);
  handler(status);
  return () => {
    statusListeners.delete(handler);
  };
}

/** Subscribe to a realtime engine event; returns an unsubscribe function. */
export function onEngineEvent<K extends EngineRealtimeEventName>(
  name: K,
  handler: (payload: EngineEventMap[K]) => void,
): () => void {
  const instance = getEngineSocket();
  const listener = (payload: unknown): void => {
    handler(payload as EngineEventMap[K]);
  };
  const untyped = instance as unknown as {
    on: (event: string, listener: (payload: unknown) => void) => unknown;
    off: (event: string, listener: (payload: unknown) => void) => unknown;
  };
  untyped.on(name, listener);
  return () => {
    untyped.off(name, listener);
  };
}
