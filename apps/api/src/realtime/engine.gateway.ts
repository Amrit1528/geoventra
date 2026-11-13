/**
 * GEOVENTRA — engine realtime gateway.
 *
 * Bridges the in-process engine event bus onto socket.io. Clients subscribe to a vehicle
 * room (`engine:<vehicleId>`) and receive `engine.telemetry`, `engine.dtc`, `engine.alert`
 * and `engine.health` events.
 */

import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';
import { EngineEventsService } from '../engine-diagnostics/engine-events.service.js';
import { engineVehicleRoom, type EngineRealtimeEvent } from '@geoventra/contracts';

interface EngineSocket extends Socket {
  data: { organisationId?: string; vehicleIds?: Set<string> };
}

@WebSocketGateway({
  cors: { origin: '*' },
  transports: ['websocket', 'polling'],
})
export class EngineGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private server!: Server;

  private readonly logger = new Logger(EngineGateway.name);
  private readonly unsubscribe: () => void;

  constructor(private readonly events: EngineEventsService) {
    this.unsubscribe = this.events.subscribe((event) => this.dispatch(event));
  }

  handleConnection(client: EngineSocket): void {
    client.data.vehicleIds = new Set<string>();
    this.logger.debug(`Engine gateway connected: ${client.id}`);
  }

  handleDisconnect(client: EngineSocket): void {
    for (const vehicleId of client.data.vehicleIds ?? []) {
      void client.leave(engineVehicleRoom(vehicleId));
    }
    this.logger.debug(`Engine gateway disconnected: ${client.id}`);
  }

  /** Join the room for a single vehicle. */
  @SubscribeMessage('engine:subscribe')
  async subscribe(
    @ConnectedSocket() client: EngineSocket,
    @MessageBody() body: { vehicleId?: string },
  ): Promise<{ subscribed: boolean; vehicleId: string | null }> {
    const vehicleId = body?.vehicleId;
    if (!vehicleId || typeof vehicleId !== 'string') {
      return { subscribed: false, vehicleId: null };
    }
    await client.join(engineVehicleRoom(vehicleId));
    client.data.vehicleIds ??= new Set<string>();
    client.data.vehicleIds.add(vehicleId);
    return { subscribed: true, vehicleId };
  }

  /** Leave the room for a single vehicle. */
  @SubscribeMessage('engine:unsubscribe')
  async unsubscribeVehicle(
    @ConnectedSocket() client: EngineSocket,
    @MessageBody() body: { vehicleId?: string },
  ): Promise<{ unsubscribed: boolean; vehicleId: string | null }> {
    const vehicleId = body?.vehicleId;
    if (!vehicleId || typeof vehicleId !== 'string') {
      return { unsubscribed: false, vehicleId: null };
    }
    await client.leave(engineVehicleRoom(vehicleId));
    client.data.vehicleIds?.delete(vehicleId);
    return { unsubscribed: true, vehicleId };
  }

  /** Stop forwarding events (used by the module teardown). */
  close(): void {
    this.unsubscribe();
  }

  private dispatch(event: EngineRealtimeEvent): void {
    if (!this.server) return;
    this.server.to(engineVehicleRoom(event.vehicleId)).emit(event.type, event);
  }
}
