/**
 * GEOVENTRA — infrastructure module.
 *
 * Owns the PostgreSQL connection pool and the typed query surface every feature module uses.
 * The pool pins `search_path` to the application schema so the same SQL works regardless of
 * which schema a table was created in.
 */

import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service.js';

@Global()
@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class InfrastructureModule {}
