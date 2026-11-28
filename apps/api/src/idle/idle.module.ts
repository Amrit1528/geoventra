import { Module } from '@nestjs/common';
import { DatabaseService } from '../common/infrastructure/database.service.js';
import { ReverseGeocodeService } from './reverse-geocode.service.js';
import { IdleService } from './idle.service.js';
import { IdleController } from './idle.controller.js';

@Module({
  providers: [DatabaseService, ReverseGeocodeService, IdleService],
  controllers: [IdleController],
  exports: [IdleService],
})
export class IdleModule {}