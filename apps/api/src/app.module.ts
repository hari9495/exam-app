import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule, AuditModule } from '@exam-platform/shared';
import { RbacModule } from './rbac/rbac.module';
import { AuthModule } from './auth/auth.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { StaticUploadsModule } from './organizations/static-uploads.module';
import { UsersModule } from './users/users.module';
import { QuestionsModule } from './questions/questions.module';
import { ExamsModule } from './exams/exams.module';
import { CandidatesModule } from './candidates/candidates.module';
import { InvitationsModule } from './invitations/invitations.module';
import { AttemptsAdminModule } from './attempts-admin/attempts-admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    StaticUploadsModule,
    PrismaModule,
    RbacModule,
    AuditModule,
    AuthModule,
    OrganizationsModule,
    UsersModule,
    QuestionsModule,
    ExamsModule,
    CandidatesModule,
    InvitationsModule,
    AttemptsAdminModule,
  ],
})
export class AppModule {}
