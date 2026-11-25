import { Module } from '@nestjs/common';
import { ScorecardsController } from './scorecards.controller.js';
import { ScorecardsService } from './scorecards.service.js';
import { DatabaseService } from '../common/infrastructure/database.service.js';
@Module({ controllers: [ScorecardsController], providers: [ScorecardsService, DatabaseService] })
export class ScorecardsModule {}
