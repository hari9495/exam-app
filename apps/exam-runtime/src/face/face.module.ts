import { Module } from '@nestjs/common';
import { FaceEmbedderService } from './face-embedder.service';

@Module({
  providers: [FaceEmbedderService],
  exports: [FaceEmbedderService],
})
export class FaceModule {}
