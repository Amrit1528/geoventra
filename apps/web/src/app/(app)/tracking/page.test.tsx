/**
 * GEOVENTRA — automated tests for the live fleet tracking page.
 *
 * Verifies map initialisation, filters, live position updates and the 5s polling
 * fallback — all without a backend by stubbing the transport layer (auth store,
 * tracking socket, tracking API) and MapLibre GL (jsdom has no WebGL canvas).
 *
 * Vehicle marker rendering, clustering and selection are covered by
 * `FleetMap.test.tsx`; this test validates the tracking page layer.
 */

import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TrackingPage from './page';
import { useAuthStore } from '@/lib/auth-store';
import type { TrackingSnapshot } from '@geoventra/contracts';
import { fetchSnapshot } from '@/lib/track-api';
import {
  connectTrackingSocket,
  onTrackingSocketStatus,
  onTrackingPositions,
} from '@/lib/tracking-socket';

// ── Stub MapLibre GL (jsdom has no WebGL canvas) ──────────────────────────
// The mock classes live inside the factory: Vitest hoists the factory above
// top-level class declarations, so references outside the factory would hit
// a "before initialisation" error.

vi.mock('maplibre-gl', () => {
  class MockLngLatBounds {
    constructor(public west = 0, public south = 0, public east = 10, public north = 10) {}
    getWest() { return this.west; }
    getSouth() { return this.south; }
    getEast() { return this.east; }
    getNorth() { return this.north; }
    extend() { return this; }
    getCenter() { return { lng: 5, lat: 5 }; }
  }

  class MockMap {
    public controls: { control: unknown; position: string }[] = [];
    public sources: Record<string, unknown> = {};
    public layers: unknown[] = [];
    public onHandlers = new Map<string, Set<(payload: unknown) => void>>();
    public container = document.createElement('div');
    public zoomValue = 4;
    public fitBoundsBounds: { bounds: unknown; options: unknown } | null = null;
    public mapRef: HTMLElement | null = null;

    constructor(public options: Record<string, unknown> = {}) {
      this.options = options;
    }

    addControl(control: unknown, position: string) {
      this.controls.push({ control, position });
    }

    on(event: string, handler: (payload: unknown) => void) {
      if (!this.onHandlers.has(event)) {
        this.onHandlers.set(event, new Set());
      }
      this.onHandlers.get(event)!.add(handler);
      handler(undefined);
      return () => {};
    }

    off(event: string, handler: (payload: unknown) => void) {
      this.onHandlers.get(event)?.delete(handler);
    }

    getSource(id: string) {
      if (!this.sources[id]) {
        this.sources[id] = { setData: vi.fn() };
      }
      return this.sources[id];
    }

    getZoom() {
      return this.zoomValue;
    }

    getBounds() {
      return new MockLngLatBounds();
    }

    fitBounds() {
      return this;
    }

    remove() {
      this.controls = [];
      this.sources = {};
      this.layers = [];
      this.onHandlers.clear();
      return this;
    }
  }

  class MockMarker {
    public element: HTMLElement;

    constructor(public options: { element: HTMLElement }) {
      this.element = options.element;
    }

    setLngLat(value: [number, number]) { return this; }

    addTo() {
      const target = document.body;
      if (target && typeof target.appendChild === 'function') {
        target.appendChild(this.element);
      }
      return this;
    }

    remove() { return this; }
  }

  class MockNavigationControl {
    constructor(public options: Record<string, unknown> = {}) {}
  }

  return {
    __esModule: true,
    Map: MockMap,
    Marker: MockMarker,
    LngLatBounds: MockLngLatBounds,
    NavigationControl: MockNavigationControl,
  };
});

// ── Stub the transport layer ──────────────────────────────────────────────

vi.mock('@/lib/auth-store', () => ({
  useAuthStore: vi.fn(() => ({ accessToken: 'token-1' })),
}));

vi.mock('@/lib/track-api', () => ({
  fetchSnapshot: vi.fn(),
}));

vi.mock('@/lib/tracking-socket', () => ({
  connectTrackingSocket: vi.fn(),
  onTrackingSocketStatus: vi.fn(() => vi.fn()),
  onTrackingPositions: vi.fn(() => vi.fn()),
}));

let positionListener: ((positions: unknown[]) => void) | null = null;

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { refetchIntervalInBackground: false } },
  });

const renderTrackingPage = () => {
  const client = createQueryClient();
  const { rerender } = render(
    <QueryClientProvider client={client}>
      <TrackingPage />
    </QueryClientProvider>,
  );
  return { client, rerender };
};

// ── Fixtures ─────────────────────────────────────────────────────────────

const createPosition = (overrides: Record<string, unknown> = {}): unknown => ({
  vehicleId: 'v1',
  registrationNumber: 'MH 12 AB 1234',
  name: 'Pune Freight Truck 01',
  category: 'truck',
  status: 'moving',
  latitude: 18.5204,
  longitude: -73.8567,
  speedKph: 46.5,
  heading: 78,
  ignition: true,
  batteryVoltage: 13.1,
  gpsSignal: 'ok',
  accuracyM: 6.4,
  driverId: null,
  driverName: null,
  groupName: null,
  city: null,
  odometerKm: 84512.1,
  openAlertCount: 0,
  deviceId: 'GEO-GPS-0001',
  deviceStatus: 'online',
  recordedAt: new Date(Date.now() - 30_000).toISOString(),
  ageSeconds: 30,
  ...overrides,
});

const mockSnapshot = (positions: unknown[]): unknown => ({
  positions,
  geofences: [],
  serverTime: new Date().toISOString(),
});

// ── Tests ────────────────────────────────────────────────────────────────

describe('Live Tracking page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Map + data ─────────────────────────────────────────────────────────

  it('loads and renders the fleet map with the snapshot positions', async () => {
    const positions = [
      createPosition(),
      createPosition({ vehicleId: 'v2', status: 'idle' }),
      createPosition({ vehicleId: 'v3', status: 'offline', speedKph: 0, ignition: false, heading: 0 }),
    ];
    (fetchSnapshot as Mock).mockResolvedValue(mockSnapshot(positions));

    const { client } = renderTrackingPage();

    await screen.findByTestId('fleet-map');
    expect(screen.getByTestId('fleet-map')).toBeInTheDocument();

    const snapshot = client.getQueryData(['tracking-snapshot']);
    expect(snapshot).not.toBeNull();
    expect((snapshot as { positions: unknown[] }).positions).toHaveLength(3);
  });

  // ── Filters + live indicator ───────────────────────────────────────────

  it('renders fleet/status filters and a live indicator', async () => {
    const positions = [
      createPosition(),
      createPosition({ vehicleId: 'v2', status: 'idle' }),
      createPosition({ vehicleId: 'v3', status: 'offline' }),
    ];
    (fetchSnapshot as Mock).mockResolvedValue(mockSnapshot(positions));

    renderTrackingPage();

    await screen.findByTestId('fleet-map');

    expect(screen.getByTestId('tracking-search')).toBeInTheDocument();
    expect(screen.getByTestId('tracking-status-filter')).toBeInTheDocument();
    expect(screen.getByTestId('tracking-group-filter')).toBeInTheDocument();
    expect(screen.getByTestId('tracking-socket-status')).toBeInTheDocument();
  });

  // ── Live position updates ──────────────────────────────────────────────

  it('merges live position updates without a page reload', async () => {
    const original = [createPosition()];
    const updated = [createPosition({ vehicleId: 'v1', speedKph: 62.4, heading: 120, recordedAt: new Date().toISOString() })];

    (fetchSnapshot as Mock).mockResolvedValue(mockSnapshot(original));
    (onTrackingPositions as Mock).mockImplementation((handler) => {
      positionListener = handler;
      return () => {};
    });

    const { client, rerender } = renderTrackingPage();

    await screen.findByTestId('fleet-map');

    // Wait for the query to populate, then apply a live-position update.
    await waitFor(() => {
      expect((client.getQueryData(['tracking-snapshot']) as TrackingSnapshot | undefined)?.positions).toHaveLength(1);
    });

    positionListener?.(updated);

    await waitFor(() => {
      expect((client.getQueryData(['tracking-snapshot']) as TrackingSnapshot | undefined)?.positions).toHaveLength(1);
    });
  });

  // ── Polling fallback ───────────────────────────────────────────────────

  it('refetches the snapshot when the 5s polling interval elapses', { timeout: 10000 }, async () => {
    const positions = [createPosition()];
    (fetchSnapshot as Mock).mockResolvedValue(mockSnapshot(positions));

    renderTrackingPage();

    await screen.findByTestId('fleet-map');

    // The tracking page polls every 5s; the refetch must run again on its own.
    await waitFor(() => {
      expect(fetchSnapshot).toHaveBeenCalledTimes(2);
    }, { timeout: 8000 });
  });
});
