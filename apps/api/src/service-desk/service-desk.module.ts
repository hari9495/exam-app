import { Module } from '@nestjs/common';
import { AuditModule, StorageModule } from '@exam-platform/shared';
import { NotificationsModule } from '../notifications/notifications.module';
import { REDIS_CONNECTION, createRedisConnection } from '../jobs/redis-connection';
import { AttachmentsService } from './attachments.service';
import { DeskAccessService } from './desk-access';
import { DesksService } from './desks.service';
import { PresenceService } from './presence.service';
import { RequesterService } from './requester.service';
import { DeskFilesController, DeskSetupController, DeskTicketsController, MyTicketsController } from './service-desk.controller';
import { TicketListsService } from './ticket-lists.service';
import { TicketsService } from './tickets.service';

// M14 Service Desk, phase 3b-1 batch 1 (SD-1.01 … SD-1.08). Later slices (SLA timers, email, portal, KB, …) add their
// own services here; the seams are named where they plug in.
@Module({
  imports: [AuditModule, StorageModule, NotificationsModule],
  controllers: [DeskSetupController, DeskTicketsController, MyTicketsController, DeskFilesController],
  providers: [
    { provide: REDIS_CONNECTION, useFactory: createRedisConnection },
    DeskAccessService,
    DesksService,
    TicketsService,
    TicketListsService,
    RequesterService,
    AttachmentsService,
    PresenceService,
  ],
})
export class ServiceDeskModule {}
