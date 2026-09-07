import { Module } from '@nestjs/common';
import { RecycleBinController } from './recycle-bin.controller';
import { RecycleBinService } from './recycle-bin.service';
import { RecycleBinRetentionService } from './recycle-bin-retention.service';

@Module({
  controllers: [RecycleBinController],
  providers: [RecycleBinService, RecycleBinRetentionService],
  exports: [RecycleBinService],
})
export class RecycleBinModule {}
