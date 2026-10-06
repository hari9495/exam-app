import { Module } from '@nestjs/common';
import { CryptoModule } from '@exam-platform/shared';
import { EmployeeHistoryModule } from '../employee-history/employee-history.module';
import { EmailModule } from '../email/email.module';
import { ProfileService } from './profile.service';
import { BulkChangesService } from './bulk-changes.service';
import { PeopleController } from './people.controller';
import { PeopleService } from './people.service';

// People core on top of the P06 history engine (step 2c): directory, org chart, team, persons, probation and
// bulk changes; the record by sensitivity class with self-service and identity / bank change requests (step 2d,
// P02 §4.4–4.5). Exports PeopleService for the daily probation sweep.
@Module({
  imports: [EmployeeHistoryModule, CryptoModule, EmailModule],
  providers: [PeopleService, BulkChangesService, ProfileService],
  controllers: [PeopleController],
  exports: [PeopleService],
})
export class PeopleModule {}
