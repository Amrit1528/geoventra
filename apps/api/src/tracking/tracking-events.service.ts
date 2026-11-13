/**
 * GEOVENTRA — tracking event bus.
 *
 * In-process publish/subscribe hub that decouples the ingest path from the websocket
 * gateway, mirroring the engine diagnostics event bus.
 */

import { Injectable } from '@nestjs/common';
import type { LivePosition } from '@geoventra/contracts';

export type TrackingEventListener = (event: {
  organisationId: string;
  positions: LivePosition[];
  emittedAt: string;
}) => void;

@Injectable()
export class TrackingEventBus {
  private readonly listeners = new Set<TrackingEventListener>();

  /** Register a listener. The returned function unregisters it. */
  subscribe(listener: TrackingEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Publish a batch of changed positions. Listener failures never break the publisher. */
  publish(event: { organisationId: string; positions: LivePosition[]; emittedAt: string }): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // A broken socket client must not break telemetry ingestion.
      }
    }
  }
}
