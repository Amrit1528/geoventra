import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller.js';
import { PartnersController } from './partners.controller.js';
import { BrandingController } from './branding.controller.js';
import { CommercialService } from './commercial.service.js';
import { DatabaseService } from '../common/infrastructure/database.service.js';
@Module({ controllers: [BillingController, PartnersController, BrandingController], providers: [CommercialService, DatabaseService] })
export class CommercialModule {}
