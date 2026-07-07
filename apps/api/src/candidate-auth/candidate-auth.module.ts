import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { CandidateAuthService } from './candidate-auth.service';
import { CandidateAuthController } from './candidate-auth.controller';
import { CandidateJwtStrategy } from './candidate-jwt.strategy';

@Module({
  imports: [PassportModule, JwtModule.register({})],
  providers: [CandidateAuthService, CandidateJwtStrategy],
  controllers: [CandidateAuthController],
  exports: [CandidateAuthService],
})
export class CandidateAuthModule {}
