import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { LeadsService } from './leads.service';
import { LeadsController } from './leads.controller';

@Module({
  imports: [EmailModule],
  controllers: [LeadsController],
  providers: [LeadsService],
})
export class LeadsModule {}
