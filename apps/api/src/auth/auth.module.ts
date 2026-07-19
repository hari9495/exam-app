import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { SamlController } from './saml.controller';
import { JwtStrategy } from './jwt.strategy';
import { SamlStrategy } from './saml.strategy';
import { SamlCacheProvider } from './saml-cache.provider';
import { AuditModule } from '@exam-platform/shared';
import { EmailModule } from '../email/email.module';
import { REDIS_CONNECTION, createRedisConnection } from '../jobs/redis-connection';

@Module({
  imports: [PassportModule, JwtModule.register({}), AuditModule, EmailModule],
  providers: [
    AuthService,
    JwtStrategy,
    SamlStrategy,
    SamlCacheProvider,
    { provide: REDIS_CONNECTION, useFactory: createRedisConnection },
  ],
  controllers: [AuthController, SamlController],
  exports: [AuthService],
})
export class AuthModule {}
