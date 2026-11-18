import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../common/auth/public.decorator.js';
import { Pt06Service } from './pt06.service.js';

@Controller('pt06')
export class Pt06Controller {
  constructor(private readonly service: Pt06Service) {}

  @Public()
  @Get('status')
  status() { return this.service.getStatus(); }

  @Public()
  @Get('connections')
  connections() { return this.service.getConnections(); }

  @Public()
  @Get('packets')
  packets(@Query('limit') limit?: string) {
    return this.service.getRecentPackets(Number(limit) || 50);
  }
}
