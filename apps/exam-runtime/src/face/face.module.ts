import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FaceEmbedderService } from './face-embedder.service';

@Module({
  imports: [ConfigModule],
  providers: [FaceEmbedderService],
  exports: [FaceEmbedderService],
})
export class FaceModule {}
