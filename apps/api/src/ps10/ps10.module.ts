import { Module } from '@nestjs/common';
import { Ps10Controller } from './ps10.controller.js';
import { Ps10Service } from './ps10.service.js';
import { TrackingModule } from '../tracking/tracking.module.js';

@Module({
  imports: [TrackingModule],
  controllers: [Ps10Controller],
  providers: [Ps10Service],
  exports: [Ps10Service],
})
export class Ps10Module {}
