/**
 * GEOVENTRA — tracking realtime gateway.
 *
 * Bridges the in-process tracking event bus onto socket.io. Clients authenticate with the
 * same JWT used for the REST API (passed in the socket handshake `auth.token`) and subscribe
 * to their own organisation's position stream; they receive `tracking.positions` with only
 * the vehicles whose position changed since the previous batch.
 */

import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import {
  TRACKING_SUBSCRIBE_MESSAGE,
  TRACKING_UNSUBSCRIBE_MESSAGE,
  trackingOrgRoom,
  type LivePosition,
  type TrackingPositionsEvent,
} from '@geoventra/contracts';
import { TrackingEventBus } from '../tracking/tracking-events.service.js';

interface TrackingSocket extends Socket {
  data: { organisationId?: string; vehicleIds?: Set<string> };
}

@WebSocketGateway({
  cors: { origin: '*' },
  transports: ['websocket', 'polling'],
})
export class TrackingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private server!: Server;

  private readonly logger = new Logger(TrackingGateway.name);
  private readonly unsubscribe: () => void;

  constructor(
    private readonly events: TrackingEventBus,
    private readonly jwtService: JwtService,
  ) {
    this.unsubscribe = this.events.subscribe((event) => this.dispatch(event));
  }

  async handleConnection(client: TrackingSocket): Promise<void> {
    const organisationId = await this.resolveOrganisationId(client);
    if (!organisationId) {
      this.logger.debug(`Tracking gateway rejected unauthenticated client ${client.id}`);
      client.disconnect(true);
      return;
    }
    client.data.organisationId = organisationId;
    await client.join(trackingOrgRoom(organisationId));
    this.logger.debug(`Tracking gateway connected ${client.id} (org ${organisationId})`);
  }

  handleDisconnect(client: TrackingSocket): void {
    const organisationId = client.data.organisationId;
    if (organisationId) {
      void client.leave(trackingOrgRoom(organisationId));
    }
    this.logger.debug(`Tracking gateway disconnected ${client.id}`);
  }

  /** Clients may subscribe explicitly (e.g. after reconnect); the room is joined on connect. */
  @SubscribeMessage(TRACKING_SUBSCRIBE_MESSAGE)
  async subscribe(
    @ConnectedSocket() client: TrackingSocket,
    @MessageBody() _body: unknown,
  ): Promise<{ subscribed: boolean }> {
    const organisationId = client.data.organisationId ?? (await this.resolveOrganisationId(client));
    if (!organisationId) return { subscribed: false };
    await client.join(trackingOrgRoom(organisationId));
    return { subscribed: true };
  }

  @SubscribeMessage(TRACKING_UNSUBSCRIBE_MESSAGE)
  async unsubscribeMessage(
    @ConnectedSocket() client: TrackingSocket,
    @MessageBody() _body: unknown,
  ): Promise<{ unsubscribed: boolean }> {
    const organisationId = client.data.organisationId;
    if (organisationId) {
      await client.leave(trackingOrgRoom(organisationId));
    }
    return { unsubscribed: true };
  }

  /** Stop forwarding events (used by module teardown). */
  close(): void {
    this.unsubscribe();
  }

  private async resolveOrganisationId(client: TrackingSocket): Promise<string | null> {
    const token = client.handshake.auth?.token ?? this.extractBearerToken(client.handshake.headers?.authorization);
    if (typeof token !== 'string' || token.length === 0) return null;
    try {
      const payload = await this.jwtService.verifyAsync<{ org?: string }>(token);
      return payload.org ?? null;
    } catch {
      return null;
    }
  }

  private extractBearerToken(header: unknown): string | null {
    if (typeof header !== 'string') return null;
    const [scheme, token] = header.split(' ');
    if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;
    return token.trim() || null;
  }

  private dispatch(event: { organisationId: string; positions: LivePosition[]; emittedAt: string }): void {
    if (!this.server) return;
    const payload: TrackingPositionsEvent = {
      type: 'tracking.positions',
      positions: event.positions,
      emittedAt: event.emittedAt,
    };
    this.server.to(trackingOrgRoom(event.organisationId)).emit('tracking.positions', payload);
  }
}
