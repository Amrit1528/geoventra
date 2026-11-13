/**
 * GEOVENTRA — live tracking socket client.
 *
 * A dedicated socket.io connection for the `/tracking` surface. The server authenticates
 * the handshake with the same JWT used for the REST API and joins the organisation's
 * `tracking-org:<organisationId>` room. Clients merge `tracking.positions` batches into the
 * query cache so markers move without a page reload.
 */

import { io, type Socket } from 'socket.io-client';
import {
  TRACKING_SUBSCRIBE_MESSAGE,
  TRACKING_UNSUBSCRIBE_MESSAGE,
  type TrackingPositionsEvent,
} from '@geoventra/contracts';
import { WS_BASE_URL } from './api';
import type { LivePosition } from '@geoventra/contracts';

/** Connection state surfaced to the UI. */
export type TrackingSocketStatus = 'idle' | 'connecting' | 'live' | 'reconnected' | 'reconnecting' | 'offline';

const STATUS_LISTENERS = new Set<(status: TrackingSocketStatus) => void>();
let socket: Socket | null = null;
let status: TrackingSocketStatus = 'idle';
let hasConnectedBefore = false;

function setStatus(next: TrackingSocketStatus): void {
  if (status === next) return;
  status = next;
  for (const listener of STATUS_LISTENERS) listener(next);
}

/** Current connection status. */
export function getTrackingSocketStatus(): TrackingSocketStatus {
  return status;
}

/** Subscribe to status changes; returns an unsubscribe function. */
export function onTrackingSocketStatus(handler: (status: TrackingSocketStatus) => void): () => void {
  STATUS_LISTENERS.add(handler);
  handler(status);
  return () => {
    STATUS_LISTENERS.delete(handler);
  };
}

/** Create (or return) the shared socket with the given bearer token. */
export function getTrackingSocket(accessToken: string | null): Socket {
  if (socket) return socket;

  socket = io(WS_BASE_URL, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
    auth: accessToken ? { token: accessToken } : undefined,
  });

  socket.on('connect', () => {
    const reconnected = hasConnectedBefore;
    hasConnectedBefore = true;
    setStatus(reconnected ? 'reconnected' : 'live');
    // Best-effort re-subscribe (the server joins the room on connection already).
    socket?.emit(TRACKING_SUBSCRIBE_MESSAGE, {});
    // Fall back to 'live' shortly after the reconnect banner shows.
    window.setTimeout(() => setStatus('live'), 8000);
  });

  socket.on('disconnect', () => setStatus('offline'));
  socket.on('connect_error', () => setStatus('reconnecting'));
  socket.io.on('reconnect_attempt', () => setStatus('reconnecting'));

  return socket;
}

/** Connect with the token; idempotent. */
export function connectTrackingSocket(accessToken: string | null): Socket {
  const instance = getTrackingSocket(accessToken);
  if (!instance.connected) {
    instance.connect();
    setStatus(status === 'idle' ? 'connecting' : status);
  }
  return instance;
}

/** Close the shared connection (used on sign-out). */
export function disconnectTrackingSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }
  socket = null;
  hasConnectedBefore = false;
  setStatus('idle');
}

/** Subscribe to position batches; returns an unsubscribe function. */
export function onTrackingPositions(
  handler: (positions: LivePosition[], emittedAt: string) => void,
): () => void {
  const instance = socket ?? getTrackingSocket(null);
  const listener = (payload: TrackingPositionsEvent): void => {
    if (payload?.type === 'tracking.positions' && Array.isArray(payload.positions)) {
      handler(payload.positions, payload.emittedAt);
    }
  };
  instance.on('tracking.positions', listener);
  return () => {
    instance.off('tracking.positions', listener);
  };
}
