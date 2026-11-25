import { Controller, Get, Query } from '@nestjs/common';
import { RequirePermissions } from '../common/auth/permissions.decorator.js';
import { Ps10Service } from './ps10.service.js';

/** Diagnostic endpoints for the PS10 TCP listener. They expose connection
 *  metadata (IP addresses and masked IMEIs), so they require an authenticated
 *  principal with device read access. */
@Controller('ps10')
@RequirePermissions('devices.read')
export class Ps10Controller {
  constructor(private readonly service: Ps10Service) {}

  @Get('status')
  status() {
    return this.service.getStatus();
  }

  @Get('connections')
  connections() {
    return this.service.getConnections();
  }

  @Get('packets')
  packets(@Query('limit') limit?: string) {
    return this.service.getRecentPackets(Number(limit) || 50);
  }
}
