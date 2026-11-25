import { Module } from '@nestjs/common';
import { DeliveryController } from './delivery.controller.js';
import { DeliveryService } from './delivery.service.js';
import { DatabaseService } from '../common/infrastructure/database.service.js';
@Module({ controllers: [DeliveryController], providers: [DeliveryService, DatabaseService] })
export class DeliveryModule {}
