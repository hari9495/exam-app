import { Module } from '@nestjs/common';
import { EmployeeHistoryModule } from '../employee-history/employee-history.module';
import { BulkChangesService } from './bulk-changes.service';
import { PeopleController } from './people.controller';
import { PeopleService } from './people.service';

// People core on top of the P06 history engine (step 2c): directory, org chart, team, persons, probation and
// bulk changes. Exports PeopleService for the daily probation sweep.
@Module({
  imports: [EmployeeHistoryModule],
  providers: [PeopleService, BulkChangesService],
  controllers: [PeopleController],
  exports: [PeopleService],
})
export class PeopleModule {}
