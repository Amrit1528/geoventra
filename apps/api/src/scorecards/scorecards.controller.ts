import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards, Inject } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard.js';
import { RequirePermissions } from '../common/auth/permissions.decorator.js';
import { ScorecardsService } from './scorecards.service.js';

const computeSchema = z.object({
  entityType: z.enum(['driver','vehicle']),
  entityId: z.string().uuid(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

@Controller('scorecards')
@UseGuards(JwtAuthGuard)
export class ScorecardsController {
  constructor(@Inject(ScorecardsService) private readonly svc: ScorecardsService) {}

  @Get('configs')
  @RequirePermissions('scorecards.read')
  async configs(@Req() req: any, @Query('entityType') entityType?: string) { return this.svc.listConfigs(req.user.organisationId, entityType); }

  @Post('configs')
  @RequirePermissions('scorecards.write')
  async createConfig(@Req() req: any, @Body() body: any) { return this.svc.createConfig(req.user.organisationId, body ?? {}); }

  @Patch('configs/:id')
  @RequirePermissions('scorecards.write')
  async updateConfig(@Req() req: any, @Param('id') id: string, @Body() body: any) { return this.svc.updateConfig(req.user.organisationId, id, body ?? {}); }

  @Post('compute')
  @RequirePermissions('scorecards.read')
  async compute(@Req() req: any, @Body() body: unknown) {
    const p = computeSchema.parse(body);
    return this.svc.compute(req.user.organisationId, p.entityType, p.entityId, p.periodStart, p.periodEnd);
  }

  @Get('results')
  @RequirePermissions('scorecards.read')
  async results(@Req() req: any, @Query() query: any) { return this.svc.listResults(req.user.organisationId, query ?? {}); }
}
