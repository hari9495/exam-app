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
import { RulesEngineModule } from '../rules-engine/rules-engine.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { CatalogService } from './catalog.service';
import { DeskAutomation } from './desk-automation';
import { DeskCatalogController, DeskRulesController, MyCatalogController } from './esm.controller';
import { JwtModule } from '@nestjs/jwt';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { DeskOrgService } from './desk-org.service';
import { DocumentsService } from './documents.service';
import { DeskChatController, DeskOrgController, MyChatController } from './esm2.controller';
import { JourneysService } from './journeys.service';
import { LifecyclesService } from './lifecycles.service';
import { RecurringService } from './recurring.service';
import { DeskEsm3Controller, InboundMsgController, MyMessagingController, ReplyLinkController, WidgetPublicController } from './esm3.controller';
import { MailboxSyncService } from './mailbox-sync.service';
import { MessagingService } from './messaging.service';
import { MobileService } from './mobile.service';
import { TeamService } from './team.service';
import { WidgetService } from './widget.service';

// M14 Service Desk, phase 3b-1: batch 1 (SD-1.01 … SD-1.08), batch 2 (SD-1.09 … SD-1.17), batch 3 (SD-1.18 …
// SD-1.23, SD-1.28: email in and out, portals and outside requesters, banners, customers) and batch 4 (SD-1.24 …
// SD-1.27, SD-1.29 … SD-1.31: knowledge and the public help centre, CSAT / NPS, reports, the standalone product,
// privacy, YukthiX's own support in the console). Phase 3b-2 batch 1 (SD-2.01 … SD-2.05, SD-2.12): the service
// catalogue, cart and order guides on the shared P18 / P19 / P03 engines, and desk automation rules. Batch 2 (SD-2.06 …
// SD-2.11, SD-2.13, SD-2.17 … SD-2.19): approval cards (workflow module), documents and e-sign, journeys, starter packs,
// moves / shares / clone / branches / HR summary, lifecycles, recurring records and sequences, interactions, live chat.
// Batch 3 (SD-2.20 … SD-2.27): the help widget and mobile SDK sign-in, WhatsApp / SMS / Teams / Slack on a desk, agent
// mailbox sync, presence / capacity / routing, shifts and the staff forecast, the agent mobile app's API.
@Module({
  imports: [AuditModule, StorageModule, NotificationsModule, CryptoModule, EmailModule, AuthModule, PlatformModule, OrganizationsModule, RulesEngineModule, WorkflowModule, JwtModule.register({})],
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
    DeskCatalogController,
    DeskRulesController,
    MyCatalogController,
    DeskOrgController,
    DeskChatController,
    MyChatController,
    DeskEsm3Controller,
    MyMessagingController,
    InboundMsgController,
    WidgetPublicController,
    ReplyLinkController,
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
    CatalogService,
    DeskAutomation,
    DeskOrgService,
    LifecyclesService,
    DocumentsService,
    JourneysService,
    RecurringService,
    ChatService,
    ChatGateway,
    MessagingService,
    WidgetService,
    TeamService,
    MailboxSyncService,
    MobileService,
  ],
})
export class ServiceDeskModule {}
