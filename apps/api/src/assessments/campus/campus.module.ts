import { Module } from '@nestjs/common';
import { EmailModule } from '../../email/email.module';
import { CampusController, CampusPublicController } from './campus.controller';
import { CampusService } from './campus.service';

// Assessments AS-3 part 2 (PRC-29): the campus kit.
@Module({
  imports: [EmailModule],
  controllers: [CampusController, CampusPublicController],
  providers: [CampusService],
})
export class AsmtCampusModule {}
