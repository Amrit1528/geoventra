/**
 * GEOVENTRA - automated tests for the live fleet map (FleetMap component).
 *
 * MapLibre GL renders to a WebGL canvas, which the jsdom test runner does not
 * provide. `maplibre-gl` is therefore stubbed with a controllable double that
 * records every call the component makes (map construction, controls, sources,
 * layers, fit-bounds). The clustering algorithm is still exercised through the
 * real `supercluster` dependency, so "marker clustering" is validated against the
 * actual library rather than the stub.
 *
 * The stub classes are declared inside the `vi.mock` factory: Vitest hoists the
 * factory to the top of the file, before top-level class declarations, so any
 * reference to the mock classes outside the factory would hit a "before
 * initialisation" error.
 */

import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactElement } from 'react';
import type { GeofenceSummary, LivePosition } from '@geoventra/contracts';
import { FleetMap } from './FleetMap';
import * as maplibreglModule from 'maplibre-gl';

// Clean the DOM between tests so markers from one render do not leak into the next.
afterEach(() => {
  document.body.innerHTML = '';
});

// ---- Stubbed MapLibre (jsdom has no WebGL canvas) ----
// The mock classes live inside the factory (see note above).

vi.mock('maplibre-gl', () => {
  class MockLngLatBounds {
    constructor(
      public west = 0,
      public south = 0,
      public east = 10,
      public north = 10,
    ) {}

    getWest() { return this.west; }
    getSouth() { return this.south; }
    getEast() { return this.east; }
    getNorth() { return this.north; }
    extend() { return this; }
    getCenter() { return { lng: 5, lat: 5 }; }
  }

  class MockMarker {
    public element: HTMLButtonElement;
    public lngLat: [number, number] = [0, 0];
    public map: unknown = null;

    constructor(public options: { element: HTMLElement }) {
      this.element = options.element as HTMLButtonElement;
    }

    setLngLat(value: [number, number]) { this.lngLat = value; return this; }
    addTo(map: unknown) {
      this.map = map;
      // Attach the marker element to the document body so the test runner can
      // query it (the component container div is real but detached from tests).
      const el = this.element;
      const target = document.body;
      if (target && typeof target.appendChild === 'function') {
        target.appendChild(el);
      }
      return this;
    }
    remove() { this.map = null; }
  }

  class MockMap {
    public controls: { control: unknown; position: string }[] = [];
    public sources: Record<string, unknown> = {};
    public layers: unknown[] = [];
    public onHandlers = new Map<string, Set<(payload: unknown) => void>>();
    public container = document.createElement('div');
    public zoomValue = 4;
    public fitBoundsBounds: { bounds: unknown; options: unknown } | null = null;
    static defaultZoom = 4;
    static defaultBounds = new MockLngLatBounds();
    static lastCreated: MockMap | null = null;

    constructor(public options: Record<string, unknown> = {}) {
      this.zoomValue = MockMap.defaultZoom;
      MockMap.lastCreated = this;
    }

    addControl(control: unknown, position: string) {
      this.controls.push({ control, position });
    }

    // Simulates an already-loaded map so the component proceeds without a canvas.
    on(event: string, handler: (payload: unknown) => void) {
      if (!this.onHandlers.has(event)) {
        this.onHandlers.set(event, new Set());
      }
      this.onHandlers.get(event)!.add(handler);
      handler(undefined);
      return () => {
        this.onHandlers.get(event)?.delete(handler);
      };
    }

    off(event: string, handler: (payload: unknown) => void) {
      this.onHandlers.get(event)?.delete(handler);
    }

    emit(event: string, payload: unknown) {
      for (const handler of this.onHandlers.get(event) ?? []) handler(payload);
    }

    getSource(id: string) {
      return this.sources[id] ?? null;
    }

    addSource(id: string, source: unknown) {
      this.sources[id] = source;
    }

    addLayer(layer: unknown) {
      this.layers.push(layer);
    }

    getZoom() {
      return this.zoomValue;
    }

    getBounds() {
      return MockMap.defaultBounds;
    }

    fitBounds(bounds: unknown, options: unknown) {
      this.fitBoundsBounds = { bounds, options };
    }

    /** Stubbed navigation helper used by the cluster-expansion handler. */
    easeTo() {}

    remove() {
      this.container.innerHTML = '';
      this.controls = [];
      this.sources = {};
      this.layers = [];
      this.onHandlers.clear();
    }
  }

  return {
    __esModule: true,
    Map: MockMap,
    Marker: MockMarker,
    LngLatBounds: MockLngLatBounds,
    NavigationControl: class {
      constructor(options?: unknown) {}
    },
  };
});

// ---- Test fixtures ----

const EMPTY_POSITIONS: LivePosition[] = [];
const EMPTY_GEOFENCES: GeofenceSummary[] = [];

function livePosition(overrides: Partial<LivePosition> = {}): LivePosition {
  return {
    vehicleId: 'v1',
    registrationNumber: 'ABC 1234',
    name: 'Test Vehicle',
    category: 'truck',
    status: 'moving',
    latitude: 18.5204,
    longitude: -73.8567,
    speedKph: 46.5,
    heading: 78,
    ignition: true,
    batteryVoltage: null,
    gpsSignal: 'ok',
    accuracyM: null,
    driverId: null,
    driverName: null,
    groupName: null,
    city: null,
    odometerKm: 0,
    openAlertCount: 0,
    deviceId: null,
    deviceStatus: null,
    recordedAt: new Date().toISOString(),
    ageSeconds: 0,
    ...overrides,
  };
}

function renderMap(
  positions: LivePosition[],
  selectedId: string | null = null,
  onSelect: ((vehicleId: string) => void) | null = null,
  fitSignal: number = 0,
) {
  return render(
    <FleetMap
      positions={positions}
      geofences={EMPTY_GEOFENCES}
      selectedId={selectedId}
      onSelect={onSelect ?? (() => {})}
      fitSignal={fitSignal}
    />,
  );
}

// ---- Helpers to reach the stubbed Map instance ----
// The mock classes are re-exported through `maplibreglModule` (see the factory),
// so the test reaches them through that namespace rather than a top-level
// variable (which would be a "before initialisation" error).

const stub = maplibreglModule as unknown as { Map: unknown; LngLatBounds: unknown };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MapCtor = stub.Map as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const LngLatBoundsCtor = stub.LngLatBounds as any;

function mapInstance(): unknown {
  return MapCtor?.lastCreated ?? null;
}

function setMapZoom(zoom: number): void {
  if (MapCtor) MapCtor.defaultZoom = zoom;
}

function setMapBounds(west: number, south: number, east: number, north: number): void {
  if (MapCtor && LngLatBoundsCtor) MapCtor.defaultBounds = new LngLatBoundsCtor(west, south, east, north);
}

// ---- Map initialisation ----

describe('FleetMap', () => {
  it('renders the map container and initialises controls + OSM tiles', () => {
    render(<FleetMap positions={EMPTY_POSITIONS} geofences={EMPTY_GEOFENCES} selectedId={null} onSelect={() => {}} />);

    const map = screen.getByTestId('fleet-map');
    expect(map).toBeInTheDocument();
    expect(map).toHaveAttribute('role', 'application');
    expect(map).toHaveAttribute('aria-label', 'Live fleet map');

    const instance = mapInstance() as {
      controls: { position: string }[];
      sources: Record<string, unknown>;
      layers: unknown[];
    };
    expect(instance).not.toBeNull();

    // Pan/zoom controls are added so the user can zoom and pan.
    expect(instance.controls.some((control) => control.position === 'bottom-right')).toBe(true);

    // The 'load' handler registers the OSM raster tiles and the raster layer.
    expect(instance.sources['osm-tiles']).toBeDefined();
    expect(instance.layers.some((layer) => (layer as { id: string }).id === 'osm')).toBe(true);
  });

  it('renders one marker per live vehicle when no clustering is active', () => {
    const positions = [
      livePosition({ vehicleId: 'v1', registrationNumber: 'ABC 1', latitude: 18.5204, longitude: -73.8567 }),
      livePosition({ vehicleId: 'v2', registrationNumber: 'ABC 2', latitude: 18.5312, longitude: -73.8612 }),
      livePosition({ vehicleId: 'v3', registrationNumber: 'ABC 3', latitude: 18.5158, longitude: -73.9012, status: 'offline' }),
    ];
    // Zoom above the supercluster maxZoom so every point is its own marker.
    setMapZoom(18);
    setMapBounds(-75, 18, -73, 19);

    const onSelect = vi.fn();
    render(<FleetMap positions={positions} geofences={EMPTY_GEOFENCES} selectedId={null} onSelect={onSelect} />);

    const markers = screen.getAllByTestId('vehicle-marker');
    expect(markers).toHaveLength(3);
    for (const marker of markers) {
      expect(marker).toHaveAttribute('data-testid', 'vehicle-marker');
      expect(marker).toHaveAttribute('data-vehicle-id');
    }
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('renders the map fit-to-fleet animation when requested', () => {
    const positions = [livePosition()];
    setMapZoom(18);
    setMapBounds(-75, 18, -73, 19);

    const onSelect = vi.fn();
    const { rerender } = render(<FleetMap positions={positions} geofences={EMPTY_GEOFENCES} selectedId={null} onSelect={onSelect} fitSignal={0} />);

    const instance = mapInstance() as { fitBoundsBounds: { bounds: unknown; options: unknown } | null };
    expect(instance.fitBoundsBounds).toBeNull();

    // A fit-signal (e.g. "Fit to fleet" button) triggers fitBounds.
    rerender(<FleetMap positions={positions} geofences={EMPTY_GEOFENCES} selectedId={null} onSelect={onSelect} fitSignal={1} />);
    expect(instance.fitBoundsBounds).not.toBeNull();
  });

  // ---- Vehicle marker rendering + selection + offline ----

  it('renders an offline vehicle marker with the offline class', () => {
    const positions = [livePosition({ vehicleId: 'v-off', status: 'offline', speedKph: 0, ignition: false })];
    setMapZoom(18);
    setMapBounds(-75, 18, -73, 19);

    render(<FleetMap positions={positions} geofences={EMPTY_GEOFENCES} selectedId={null} onSelect={() => {}} />);

    const marker = screen.getByTestId('vehicle-marker');
    expect(marker).toHaveClass('vehicle-marker--offline');
    expect(marker).toHaveAttribute('data-vehicle-id', 'v-off');
  });

  it('selects a vehicle and notifies the parent', () => {
    const positions = [livePosition({ vehicleId: 'v-select', registrationNumber: 'SEL 1' })];
    setMapZoom(18);
    setMapBounds(-75, 18, -73, 19);

    const onSelect = vi.fn();
    render(<FleetMap positions={positions} geofences={EMPTY_GEOFENCES} selectedId={null} onSelect={onSelect} />);

    const marker = screen.getByTestId('vehicle-marker');
    fireEvent.click(marker);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('v-select');
  });

  it('does not select a vehicle when the cluster marker is clicked', () => {
    const positions = [
      livePosition({ vehicleId: 'v1', latitude: 18.52, longitude: -73.85 }),
      livePosition({ vehicleId: 'v2', latitude: 18.52, longitude: -73.85 }),
      livePosition({ vehicleId: 'v3', latitude: 18.52, longitude: -73.85 }),
    ];
    setMapZoom(3);
    setMapBounds(-75, 18, -73, 19);

    const onSelect = vi.fn();
    render(<FleetMap positions={positions} geofences={EMPTY_GEOFENCES} selectedId={null} onSelect={onSelect} />);

    const cluster = screen.getByTestId('vehicle-cluster');
    expect(cluster).toBeInTheDocument();
    expect(cluster).toHaveAttribute('aria-label', '3 vehicles — zoom in');
    fireEvent.click(cluster);

    expect(onSelect).not.toHaveBeenCalled();
  });

  // ---- Marker clustering ----

  it('clusters nearby vehicles into a single cluster marker', () => {
    // Three vehicles at the same location -> one supercluster at a clusterable zoom.
    const positions = [
      livePosition({ vehicleId: 'v1', latitude: 18.5204, longitude: -73.8567, name: 'V1' }),
      livePosition({ vehicleId: 'v2', latitude: 18.5204, longitude: -73.8567, name: 'V2' }),
      livePosition({ vehicleId: 'v3', latitude: 18.5204, longitude: -73.8567, name: 'V3', status: 'idle' }),
    ];
    setMapZoom(3);
    setMapBounds(-75, 18, -73, 19);

    render(<FleetMap positions={positions} geofences={EMPTY_GEOFENCES} selectedId={null} onSelect={() => {}} />);

    const cluster = screen.getByTestId('vehicle-cluster');
    expect(cluster).toBeInTheDocument();
    expect(cluster).toHaveAttribute('aria-label', '3 vehicles — zoom in');

    // The individual markers collapse into the cluster at a clusterable zoom.
    expect(screen.queryAllByTestId('vehicle-marker')).toHaveLength(0);
  });
});
