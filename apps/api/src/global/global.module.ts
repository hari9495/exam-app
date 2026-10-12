import { Module } from '@nestjs/common';
import { OrgStructureModule } from '../org-structure/org-structure.module';
import { GlobalController } from './global.controller';
import { GlobalService } from './global.service';

// Batch G1 · global core: country packs, translations of company words, a person's language, the
// "Add a country" guide (G1-GLOBAL-CORE-BUILD-DESIGN).
@Module({
  imports: [OrgStructureModule],
  providers: [GlobalService],
  controllers: [GlobalController],
})
export class GlobalModule {}
