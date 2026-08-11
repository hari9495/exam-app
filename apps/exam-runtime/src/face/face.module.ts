import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CryptoModule } from '@exam-platform/shared';
import { FaceEmbedderService } from './face-embedder.service';
import { FaceVerificationService } from './face-verification.service';

@Module({
  imports: [ConfigModule, CryptoModule],
  providers: [FaceEmbedderService, FaceVerificationService],
  exports: [FaceEmbedderService, FaceVerificationService],
})
export class FaceModule {}
