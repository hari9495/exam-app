import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { SamlController } from './saml.controller';
import { JwtStrategy } from './jwt.strategy';
import { SamlStrategy } from './saml.strategy';
import { SamlCacheProvider } from './saml-cache.provider';
import { Resolver } from 'node:dns/promises';
import { AuditModule, CryptoModule, StorageModule } from '@exam-platform/shared';
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
import { SmsChannelModule } from '../sms-channel/sms-channel.module';
import { SsoService } from './sso.service';
import { OidcService } from './oidc.service';
import { SsoController } from './sso.controller';
import { SocialController } from './social.controller';
import { DNS_TXT_RESOLVER, IdentityProvidersService } from './identity-providers.service';
import { CompanyScopeService } from './company-scope';
import { RefreshThrottlerGuard } from './refresh-throttler.guard';
import { CredentialThrottlerGuard } from './credential-throttler.guard';
import { IdentityProvidersController } from './identity-providers.controller';

// Its own connection, fast-failing: the shared BullMQ-style connection (maxRetriesPerRequest:
// null) would park sign-in requests forever during a Redis outage instead of failing closed.
function createLoginProtectionRedis(): Redis {
  const client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: 1, commandTimeout: 2000 });
  client.on('error', () => {}); // failures surface per command (LoginProtectionService fails closed)
  return Object.assign(client, { onApplicationShutdown: () => client.disconnect() });
}

// Bounded DNS lookups (domain ownership checks: an admin action and the nightly re-check, never on
// the sign-in path).
function createTxtResolver() {
  const resolver = new Resolver({ timeout: 3000, tries: 2 });
  return (name: string) => resolver.resolveTxt(name);
}

@Module({
  imports: [PassportModule, JwtModule.register({}), AuditModule, CryptoModule, StorageModule, EmailModule, PasswordPolicyModule, SmsChannelModule],
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
    SsoService,
    OidcService,
    IdentityProvidersService,
    { provide: DNS_TXT_RESOLVER, useFactory: createTxtResolver },
    CompanyScopeService,
    RefreshThrottlerGuard,
    CredentialThrottlerGuard,
  ],
  controllers: [AuthController, SamlController, SsoController, SessionsController, SecurityPolicyController, MfaController, OtpController, IdentityProvidersController, SocialController],
  exports: [AuthService, IdentityProvidersService],
})
export class AuthModule {}
