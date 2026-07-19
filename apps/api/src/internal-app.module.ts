import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@exam-platform/shared';
import { InternalModule } from './internal/internal.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, InternalModule],
})
export class InternalAppModule {}
