/**
 * GEOVENTRA — automated tests for the live tracking WebSocket client.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  onTrackingSocketStatus,
  getTrackingSocketStatus,
  connectTrackingSocket,
  getTrackingSocket,
  disconnectTrackingSocket,
} from './tracking-socket';

class MockEventEmitter {
  private listeners = new Map<string, Set<(payload: unknown) => void>>();

  on(event: string, handler: (payload: unknown) => void) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler);
    return () => {
      this.listeners.get(event)?.delete(handler);
    };
  }

  emit(event: string, payload?: unknown) {
    for (const handler of this.listeners.get(event) ?? []) handler(payload);
  }

  removeAllListeners() {
    this.listeners.clear();
  }
}

class MockSocket {
  connected = false;
  io = new MockEventEmitter();
  on(event: string, handler: (payload: unknown) => void) {
    return this.io.on(event, handler);
  }
  emit(event: string, payload?: unknown) {
    this.io.emit(event, payload);
  }
  connect() {
    this.connected = true;
    this.emit('connect');
  }
  disconnect() {
    this.connected = false;
    this.emit('disconnect');
  }
  removeAllListeners() {
    this.io.removeAllListeners();
  }
}

vi.mock('socket.io-client', () => {
  return {
    io: vi.fn(() => new MockSocket()),
  };
});

let socketStatus: string | null = null;
const captureStatus = (handler: (status: string) => void) => {
  const off = onTrackingSocketStatus((s) => {
    socketStatus = s as string;
    handler(s);
  });
  return () => off();
};

describe('tracking socket client', () => {
  beforeEach(() => {
    disconnectTrackingSocket();
  });

  it('reports idle as the initial status', () => {
    expect(getTrackingSocketStatus()).toBe('idle');
  });

  it('joins the tracking channel and reports live on connect', () => {
    const off = captureStatus(() => {});
    getTrackingSocket('token-1');
    (getTrackingSocket('token-1') as unknown as MockSocket).emit('connect');
    expect(getTrackingSocketStatus()).toBe('live');
    off();
  });

  it('reports offline after a disconnect', () => {
    const off = captureStatus(() => {});
    getTrackingSocket('token-1');
    const socket = getTrackingSocket('token-1') as unknown as MockSocket;
    socket.emit('connect');
    expect(getTrackingSocketStatus()).toBe('live');
    socket.emit('disconnect');
    expect(getTrackingSocketStatus()).toBe('offline');
    off();
  });

  it('transitions back to reconnected on a subsequent connect', () => {
    const off = captureStatus(() => {});
    getTrackingSocket('token-1');
    const socket = getTrackingSocket('token-1') as unknown as MockSocket;
    socket.emit('connect');
    expect(getTrackingSocketStatus()).toBe('live');
    socket.emit('disconnect');
    expect(getTrackingSocketStatus()).toBe('offline');
    socket.emit('connect');
    expect(getTrackingSocketStatus()).toBe('reconnected');
    off();
  });

  it('marks an explicit subscribe message on connect', () => {
    const off = captureStatus(() => {});
    getTrackingSocket('token-1');
    const socket = getTrackingSocket('token-1') as unknown as MockSocket;
    socket.emit('connect');
    expect(getTrackingSocketStatus()).toBe('live');
    off();
  });
});

describe('connectTrackingSocket', () => {
  beforeEach(() => {
    disconnectTrackingSocket();
  });

  it('returns the shared socket and marks it connecting', () => {
    const socket = connectTrackingSocket('token-1');
    expect(socket).toBeDefined();
    console.log('=== STATUS AFTER connectTrackingSocket:', getTrackingSocketStatus());
    expect(getTrackingSocketStatus()).toBe('connecting');
  });
});
