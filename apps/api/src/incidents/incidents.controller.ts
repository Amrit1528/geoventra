import { Body, Controller, Get, Param, Post, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { IncidentsService } from './incidents.service.js';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard.js';

@Controller('incidents')
@UseGuards(JwtAuthGuard)
export class IncidentsController {
  constructor(private readonly svc: IncidentsService) {}

  @Get()
  list(@Req() req: any, @Query() q: any) { return this.svc.list(req.user.organisationId, q ?? {}); }

  @Get(':id')
  get(@Req() req: any, @Param('id') id: string) { return this.svc.get(req.user.organisationId, id); }

  @Post()
  create(@Req() req: any, @Body() body: any) { return this.svc.create(req.user.organisationId, body ?? {}, req.user.sub); }

  @Patch(':id/status')
  status(@Req() req: any, @Param('id') id: string, @Body() body: any) { return this.svc.updateStatus(req.user.organisationId, id, body?.status, body?.resolutionDetails); }

  @Patch(':id/assign')
  assign(@Req() req: any, @Param('id') id: string, @Body() body: any) { return this.svc.assign(req.user.organisationId, id, body?.assignedUserId); }

  @Post(':id/comments')
  comment(@Req() req: any, @Param('id') id: string, @Body() body: any) { return this.svc.addComment(req.user.organisationId, id, req.user.sub, body?.comment ?? ''); }
}