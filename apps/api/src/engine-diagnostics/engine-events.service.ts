/**
 * GEOVENTRA — engine event bus.
 *
 * A minimal publish/subscribe hub that decouples the engine-diagnostics service from the
 * websocket gateway. The gateway registers a listener; the service publishes domain events.
 * Using an in-process bus (rather than an external broker) keeps the Phase 5.1 realtime path
 * dependency-free while still allowing the gateway to live in its own module.
 */

import { Injectable } from '@nestjs/common';
import type { EngineRealtimeEvent } from '@geoventra/contracts';

export type EngineEventListener = (event: EngineRealtimeEvent) => void;

@Injectable()
export class EngineEventsService {
  private readonly listeners = new Set<EngineEventListener>();

  /** Register a listener. The returned function unregisters it. */
  subscribe(listener: EngineEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Publish an event to every listener. Listener failures never break the publisher. */
  publish(event: EngineRealtimeEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // A broken socket client must not break telemetry ingestion.
      }
    }
  }
}
