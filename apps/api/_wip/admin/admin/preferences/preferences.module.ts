/** GEOVENTRA — preferences module.
 *  Registers the preferences controller and service.
 */

import { Module } from '@nestjs/common';
import { PreferencesController } from './preferences.controller.js';
import { NotificationsService } from './notifications.service.js';

@Module({
  controllers: [PreferencesController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class PreferencesModule {}
