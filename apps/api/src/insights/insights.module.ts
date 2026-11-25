import { Module } from '@nestjs/common';
import { InsightsController } from './insights.controller.js';
import { InsightsService } from './insights.service.js';
import { DatabaseService } from '../common/infrastructure/database.service.js';
@Module({ controllers: [InsightsController], providers: [InsightsService, DatabaseService] })
export class InsightsModule {}
