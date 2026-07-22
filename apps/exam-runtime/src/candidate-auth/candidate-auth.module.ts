import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuditModule } from '@exam-platform/shared';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { CandidateAuthService } from './candidate-auth.service';
import { CandidateAuthController } from './candidate-auth.controller';
import { CandidateJwtStrategy } from './candidate-jwt.strategy';

@Module({
  imports: [PassportModule, JwtModule.register({}), MonitoringModule, AuditModule],
  providers: [CandidateAuthService, CandidateJwtStrategy],
  controllers: [CandidateAuthController],
  exports: [CandidateAuthService],
})
export class CandidateAuthModule {}
