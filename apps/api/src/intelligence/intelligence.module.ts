import { Module } from '@nestjs/common';
import { IntelligenceService } from './intelligence.service.js';
import { IntelligenceController } from './intelligence.controller.js';

@Module({
  controllers: [IntelligenceController],
  providers: [IntelligenceService],
  exports: [IntelligenceService],
})
export class IntelligenceModule {}