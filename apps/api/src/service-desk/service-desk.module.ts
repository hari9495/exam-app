import { Module } from '@nestjs/common';
import { AuditModule, CryptoModule, StorageModule } from '@exam-platform/shared';
import { NotificationsModule } from '../notifications/notifications.module';
import { REDIS_CONNECTION, createRedisConnection } from '../jobs/redis-connection';
import { AttachmentsService } from './attachments.service';
import { DeskAccessService } from './desk-access';
import { DeskJobsService } from './desk-jobs.service';
import { DesksService } from './desks.service';
import { MeService } from './me.service';
import { PresenceService } from './presence.service';
import { RequesterService } from './requester.service';
import { CalendarFeedController, DeskFilesController, DeskSetupController, DeskTicketsController, DeskWorkController, MyTicketsController } from './service-desk.controller';
import { SlaService } from './sla.service';
import { TicketListsService } from './ticket-lists.service';
import { TicketsService } from './tickets.service';
import { WorkService } from './work.service';

// M14 Service Desk, phase 3b-1: batch 1 (SD-1.01 … SD-1.08) and batch 2 (SD-1.09 … SD-1.17). Later slices (email,
// portal, KB, …) add their own services here; the seams are named where they plug in.
@Module({
  imports: [AuditModule, StorageModule, NotificationsModule, CryptoModule],
  controllers: [DeskSetupController, DeskTicketsController, DeskWorkController, MyTicketsController, DeskFilesController, CalendarFeedController],
  providers: [
    { provide: REDIS_CONNECTION, useFactory: createRedisConnection },
    DeskAccessService,
    DesksService,
    TicketsService,
    TicketListsService,
    RequesterService,
    AttachmentsService,
    PresenceService,
    SlaService,
    WorkService,
    MeService,
    DeskJobsService,
  ],
})
export class ServiceDeskModule {}
