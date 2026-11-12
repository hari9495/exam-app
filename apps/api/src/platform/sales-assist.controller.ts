import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, MaxLength, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { PlatformStaffGuard } from './platform-staff.guard';
import { OUTCOMES, SalesAssistService, TOPICS } from './sales-assist.service';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/** Talk to us (PLT-41, answer 1210): the nudge it came from, the phone to call back and what to discuss. */
export class TalkToUsDto {
  @IsUUID() nudgeId!: string;
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/[\s-]/g, '').replace(/^(\+91|0)/, '') : value))
  @IsString()
  @Matches(/^[6-9][0-9]{9}$/, { message: 'Give a 10-digit Indian mobile number.' })
  phone!: string;
  @IsArray() @ArrayMaxSize(4) @IsIn(TOPICS, { each: true }) topics!: string[];
  @IsOptional() @trim() @IsString() @MaxLength(500) @Matches(/^[^<>]*$/, { message: 'Write it without < or >.' }) note?: string;
}

export class SalesOutcomeDto {
  @IsIn(OUTCOMES) status!: (typeof OUTCOMES)[number];
  @IsOptional() @trim() @IsString() @MaxLength(500) note?: string;
  @Type(() => Number) @IsInt() @Min(1) version!: number;
}

// YukthiX console C-8, YX-13: staff only, on their own platform session with their security key, every route behind the
// sales key (staff role: Customer success, answers 1058 and 1086).
@Controller('platform/sales')
@UseGuards(JwtAuthGuard, PlatformStaffGuard, PermissionsGuard)
export class SalesAssistController {
  constructor(private readonly sales: SalesAssistService) {}

  @Get()
  @RequirePermissions('platform.sales.work')
  queue(@CurrentUserId() actor: string) {
    return this.sales.queue(actor);
  }

  @Post(':id/take')
  @HttpCode(200)
  @RequirePermissions('platform.sales.work')
  take(@CurrentUserId() actor: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.sales.take(actor, id);
  }

  @Post(':id/outcome')
  @HttpCode(200)
  @RequirePermissions('platform.sales.work')
  outcome(@CurrentUserId() actor: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SalesOutcomeDto) {
    return this.sales.outcome(actor, id, dto);
  }
}
