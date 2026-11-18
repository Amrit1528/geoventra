import { Global, Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

/**
 * Global JWT module that ensures JwtService is available everywhere.
 *
 * The @nestjs/jwt JwtModule.register() method returns a DynamicModule that does NOT
 * export JwtService, which causes JwtService to be unavailable for dependency injection
 * in other modules. This wrapper re-exports JwtService as a global provider so that
 * auth guards and other services can inject it correctly. The instance is constructed
 * with the configured signing secret so sign/verify operations succeed.
 *
 * NOTE: This module is GLOBAL so JwtService is available in all modules without
 * importing JwtModule in each module.
 */
@Global()
@Module({
  providers: [
    {
      provide: JwtService,
      useFactory: () =>
        new JwtService({
          secret: process.env.JWT_ACCESS_SECRET ?? 'geoventra-development-access-secret',
          signOptions: { expiresIn: Number(process.env.JWT_ACCESS_TTL_SECONDS ?? 900) },
        }),
    },
  ],
  exports: [JwtService],
})
export class JwtModule {}
