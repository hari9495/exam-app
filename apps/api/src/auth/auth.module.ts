import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { SamlController } from './saml.controller';
import { JwtStrategy } from './jwt.strategy';
import { SamlStrategy } from './saml.strategy';
import { SamlCacheProvider } from './saml-cache.provider';
import { AuditModule, CryptoModule } from '@exam-platform/shared';
import { EmailModule } from '../email/email.module';
import { REDIS_CONNECTION, createRedisConnection } from '../jobs/redis-connection';
import Redis from 'ioredis';
import { SessionsService } from './sessions.service';
import { SessionsController } from './sessions.controller';
import { LOGIN_PROTECTION_REDIS, LoginProtectionService } from './login-protection.service';
import { PasswordPolicyModule } from './password-policy.module';
import { SecurityPolicyService } from './security-policy.service';
import { SecurityPolicyController } from './security-policy.controller';
import { MfaService } from './mfa.service';
import { MfaResetService } from './mfa-reset.service';
import { MfaController } from './mfa.controller';
import { OtpService } from './otp.service';
import { OtpController } from './otp.controller';
import { OTP_SMS_SENDER, createOtpSmsSender } from './otp-sender';

// Its own connection, fast-failing: the shared BullMQ-style connection (maxRetriesPerRequest:
// null) would park sign-in requests forever during a Redis outage instead of failing closed.
function createLoginProtectionRedis(): Redis {
  const client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: 1, commandTimeout: 2000 });
  client.on('error', () => {}); // failures surface per command (LoginProtectionService fails closed)
  return Object.assign(client, { onApplicationShutdown: () => client.disconnect() });
}

@Module({
  imports: [PassportModule, JwtModule.register({}), AuditModule, CryptoModule, EmailModule, PasswordPolicyModule],
  providers: [
    AuthService,
    JwtStrategy,
    SamlStrategy,
    SamlCacheProvider,
    { provide: REDIS_CONNECTION, useFactory: createRedisConnection },
    SessionsService,
    SecurityPolicyService,
    LoginProtectionService,
    MfaService,
    MfaResetService,
    { provide: LOGIN_PROTECTION_REDIS, useFactory: createLoginProtectionRedis },
    OtpService,
    { provide: OTP_SMS_SENDER, useFactory: createOtpSmsSender },
  ],
  controllers: [AuthController, SamlController, SessionsController, SecurityPolicyController, MfaController, OtpController],
  exports: [AuthService],
})
export class AuthModule {}
