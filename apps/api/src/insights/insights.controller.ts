import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards, Inject } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard.js';
import { RequirePermissions } from '../common/auth/permissions.decorator.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/auth/authenticated-user.interface.js';
import { InsightsService } from './insights.service.js';

const ruleSchema = z.object({
  ruleType: z.string().min(1),
  name: z.string().optional(),
  enabled: z.boolean().optional(),
  severity: z.string().optional(),
  threshold: z.record(z.string(), z.any()).optional(),
  description: z.string().optional(),
});

@Controller('insights')
@UseGuards(JwtAuthGuard)
export class InsightsController {
  constructor(@Inject(InsightsService) private readonly svc: InsightsService) {}

  @Get('rules')
  @RequirePermissions('insights.read')
  async rules(@Req() req: any) { return this.svc.listRules(req.user.organisationId); }

  @Post('rules')
  @RequirePermissions('insights.write')
  async upsertRule(@Req() req: any, @Body() body: unknown) {
    const parsed = ruleSchema.parse(body);
    return this.svc.upsertRule(req.user.organisationId, parsed);
  }

  @Get('events')
  @RequirePermissions('insights.read')
  async events(@Req() req: any, @Query() query: any) { return this.svc.listEvents(req.user.organisationId, query ?? {}); }

  @Post('evaluate')
  @RequirePermissions('insights.write')
  async evaluate(@Req() req: any) { return this.svc.evaluate(req.user.organisationId); }

  @Patch('events/:id/acknowledge')
  @RequirePermissions('insights.write')
  async ack(@Req() req: any, @Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.acknowledge(req.user.organisationId, id, user.id);
  }

  @Patch('events/:id/resolve')
  @RequirePermissions('insights.write')
  async resolve(@Req() req: any, @Param('id') id: string, @Body() body: any, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.resolve(req.user.organisationId, id, user.id, body?.notes);
  }
}
