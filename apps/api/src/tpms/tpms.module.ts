import { Module } from '@nestjs/common';
import { TpmsController } from './tpms.controller.js';
import { TpmsService } from './tpms.service.js';
import { TpmsRepository } from './tpms.repository.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

@Module({
  imports: [NotificationsModule],
  controllers: [TpmsController],
  providers: [TpmsService, TpmsRepository],
  exports: [TpmsService],
})
export class TpmsModule {}
