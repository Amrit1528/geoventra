import { Module } from '@nestjs/common';
import { Pt06Controller } from './pt06.controller.js';
import { Pt06Service } from './pt06.service.js';
import { TrackingModule } from '../tracking/tracking.module.js';
import { AlertModule } from '../alerts/alert.module.js';

@Module({
  imports: [TrackingModule, AlertModule],
  controllers: [Pt06Controller],
  providers: [Pt06Service],
  exports: [Pt06Service],
})
export class Pt06Module {}
