import { Module } from '@nestjs/common';
import { AuditModule, CryptoModule, StorageModule } from '@exam-platform/shared';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';
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
import { DeskChannelsController, InboundMailController, PortalController } from './channels.controller';
import { CustomersService } from './customers.service';
import { MailInService } from './mail-in.service';
import { MailOutService, SD_DNS_RESOLVER, dnsResolverFactory } from './mail-out.service';
import { PortalService } from './portal.service';
import { PlatformModule } from '../platform/platform.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { DirectoryService } from './directory.service';
import { DeskInsightsController } from './insights.controller';
import { KbService } from './kb.service';
import { PrivacyService } from './privacy.service';
import { ConsoleDeskController, MyHelpController, PortalHelpController, PublicHelpController, RateLinkController, ScimController, SignUpController, WallController, YukthixSupportController } from './public-desk.controller';
import { ReportsService } from './reports.service';
import { SupportBridgeService } from './support-bridge.service';
import { SurveysService } from './surveys.service';

// M14 Service Desk, phase 3b-1: batch 1 (SD-1.01 … SD-1.08), batch 2 (SD-1.09 … SD-1.17), batch 3 (SD-1.18 …
// SD-1.23, SD-1.28: email in and out, portals and outside requesters, banners, customers) and batch 4 (SD-1.24 …
// SD-1.27, SD-1.29 … SD-1.31: knowledge and the public help centre, CSAT / NPS, reports, the standalone product,
// privacy, YukthiX's own support in the console).
@Module({
  imports: [AuditModule, StorageModule, NotificationsModule, CryptoModule, EmailModule, AuthModule, PlatformModule, OrganizationsModule],
  controllers: [
    DeskSetupController,
    DeskTicketsController,
    DeskWorkController,
    MyTicketsController,
    DeskFilesController,
    CalendarFeedController,
    DeskChannelsController,
    InboundMailController,
    PortalController,
    DeskInsightsController,
    MyHelpController,
    PortalHelpController,
    PublicHelpController,
    RateLinkController,
    WallController,
    SignUpController,
    ScimController,
    YukthixSupportController,
    ConsoleDeskController,
  ],
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
    { provide: SD_DNS_RESOLVER, useFactory: dnsResolverFactory },
    MailOutService,
    MailInService,
    PortalService,
    CustomersService,
    KbService,
    SurveysService,
    ReportsService,
    DirectoryService,
    PrivacyService,
    SupportBridgeService,
  ],
})
export class ServiceDeskModule {}
