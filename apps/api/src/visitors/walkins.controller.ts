import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBase64, IsBoolean, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { TenantContext } from '@exam-platform/shared';
import type { ScopeUser } from '../access/scope';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { SkipGlobalThrottle } from '../fail-open-throttler.guard';
import { PUBLIC_API_THROTTLE, STRICT_WALK_IN_THROTTLE } from '../rate-limit-tiers';
import { CurrentKiosk, KioskGuard, KioskThrottlerGuard } from '../time/kiosk.guard';
import type { Kiosk } from '../time/kiosk.service';
import { PURPOSES } from './visitor-rules';
import { ID_TYPES } from './visitor-guard-rules';
import { WalkInsService } from './walkins.service';

const who = (req: Request) => req.user as ScopeUser;
const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const NO_TAGS = /^[^<>\u0000-\u001f\u007f]*$/;

class AcceptedDto {
  @IsString() @MaxLength(40) noticeVersion!: string;
  @IsOptional() @IsUUID() ndaVersionId?: string | null;
  @IsOptional() @IsUUID() inductionVersionId?: string | null;
}

class WalkInBaseDto extends AcceptedDto {
  @trim() @IsString() @MinLength(1) @MaxLength(200) @Matches(NO_TAGS, { message: 'Use letters, spaces and ordinary punctuation in the name.' }) name!: string;
  @trim() @IsString() @MaxLength(20) mobile!: string;
  @IsOptional() @trim() @IsString() @MaxLength(200) @Matches(NO_TAGS) company?: string | null;
  @IsOptional() @IsUUID() typeId?: string | null;
  @IsOptional() @IsIn(PURPOSES) purpose?: string | null;
  /** Slice 3 (614): under 18 with the named adult. */
  @IsOptional() @IsBoolean() minor?: boolean | null;
  @IsOptional() @trim() @IsString() @MaxLength(200) @Matches(NO_TAGS) minorAdult?: string | null;
  /** Slice 3 (603): the ID type and its last 4 characters only. */
  @IsOptional() @IsIn(ID_TYPES) idType?: string | null;
  @IsOptional() @trim() @IsString() @Matches(/^[A-Za-z0-9]{4}$/, { message: 'Enter only the last 4 characters of the ID number.' }) idLast4?: string | null;
}

class DeskWalkInDto extends WalkInBaseDto {
  @IsUUID() locationId!: string;
  @IsUUID() hostUserId!: string;
  /** 610: outside the allowed hours, why reception lets them in. */
  @IsOptional() @trim() @IsString() @MaxLength(300) @Matches(NO_TAGS) hoursReason?: string | null;
}

class KioskWalkInDto extends WalkInBaseDto {
  /** Who they are meeting, as typed (matched to exactly one active person, else reception helps). */
  @trim() @IsString() @MinLength(2) @MaxLength(200) @Matches(NO_TAGS) hostName!: string;
  /** 602: a JPEG or PNG from the kiosk camera (checked by its bytes, at most 600 KB). */
  @IsOptional() @IsBase64() @MaxLength(820_000) photoBase64?: string | null;
}

class DecideDto {
  @IsBoolean() approve!: boolean;
  @IsOptional() @trim() @IsString() @MaxLength(300) @Matches(NO_TAGS) reason?: string | null;
}

class NeedsDto {
  @IsOptional() @IsUUID() typeId?: string | null;
  @trim() @IsString() @MaxLength(20) mobile!: string;
  @IsOptional() @trim() @IsString() @MaxLength(200) company?: string | null;
}

class TypeRowDto {
  @IsOptional() @IsUUID() id?: string | null;
  @trim() @IsString() @MinLength(1) @MaxLength(60) @Matches(NO_TAGS) name!: string;
  @IsBoolean() escort!: boolean;
  @IsOptional() @IsUUID() ndaPolicyId?: string | null;
  @IsOptional() @IsUUID() inductionPolicyId?: string | null;
}

class SaveTypesDto {
  @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => TypeRowDto) types!: TypeRowDto[];
}

class PassDto {
  @trim() @IsString() @MaxLength(20) code!: string;
}

// Visitors slice 2: walk-ins at reception, the host's decision and approval cards, visitor types (Settings 3.12).
// Reception needs visitors.desk.manage at the location; the host is whoever the walk-in asked for; visitor types are
// read by any signed-in person (the invite form) and changed with the settings key. Another company is not found;
// every change is refused while acting for someone else (the service checks).
@Controller('visitors')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WalkInsController {
  constructor(private readonly walkIns: WalkInsService) {}

  @Get('types')
  types(@CurrentTenant() ctx: TenantContext) {
    return this.walkIns.types(ctx);
  }

  @Put('types')
  @RequireAnyPermission('visitors.settings.manage', 'org.settings.manage')
  saveTypes(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: SaveTypesDto) {
    return this.walkIns.saveTypes(ctx, who(req), dto.types);
  }

  @Get('approvals')
  approvals(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.walkIns.approvals(ctx, who(req));
  }

  /** 602: the walk-in's photo, for the host only while they decide; never cached. */
  @Get('walk-ins/:id/photo')
  @Header('Cache-Control', 'no-store, private')
  async photo(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const p = await this.walkIns.photo(ctx, who(req), id);
    res.setHeader('Content-Type', p.type);
    return new StreamableFile(p.data);
  }

  @Post('walk-ins/:id/decide')
  @HttpCode(200)
  decide(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecideDto) {
    return this.walkIns.decide(ctx, who(req), id, dto);
  }

  @Get('desk/hosts')
  @RequireAnyPermission('visitors.desk.manage')
  hosts(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query('locationId', ParseUUIDPipe) locationId: string, @Query('q') q?: string) {
    return this.walkIns.hosts(ctx, who(req), locationId, (q ?? '').slice(0, 100));
  }

  @Get('desk/needs')
  @RequireAnyPermission('visitors.desk.manage')
  needs(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query('locationId', ParseUUIDPipe) locationId: string, @Query('typeId') typeId?: string, @Query('mobile') mobile?: string, @Query('company') company?: string) {
    return this.walkIns.deskNeeds(ctx, who(req), { locationId, typeId: typeId && /^[0-9a-f-]{36}$/i.test(typeId) ? typeId : null, mobile: mobile?.slice(0, 20), company: company?.slice(0, 200) ?? null });
  }

  @Get(':id/needs')
  @RequireAnyPermission('visitors.desk.manage')
  visitNeeds(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.walkIns.visitNeeds(ctx, who(req), id);
  }

  @Post('walk-ins')
  @RequireAnyPermission('visitors.desk.manage')
  deskWalkIn(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: DeskWalkInDto) {
    return this.walkIns.deskWalkIn(ctx, who(req), dto);
  }
}

// VIS-03 the visitor kiosk (answer 601): a tablet enrolled as a Time device in visitor mode. No sign-in: the kiosk's own
// secret (x-kiosk-token, KioskGuard: 401 when unknown, reset or revoked) and its mode (an attendance kiosk is refused);
// every call is limited per kiosk (KioskThrottlerGuard), and a visit is only ever read by the kiosk that started it.
@Controller('visitor-kiosk')
@SkipGlobalThrottle()
@UseGuards(KioskThrottlerGuard, KioskGuard)
@Throttle(PUBLIC_API_THROTTLE)
export class VisitorKioskController {
  constructor(private readonly walkIns: WalkInsService) {}

  @Get('me')
  me(@CurrentKiosk() k: Kiosk) {
    return this.walkIns.kioskInfo(k);
  }

  @Post('needs')
  @HttpCode(200)
  needs(@CurrentKiosk() k: Kiosk, @Body() dto: NeedsDto) {
    return this.walkIns.kioskNeeds(k, dto);
  }

  @Post('walk-ins')
  @HttpCode(200)
  @Throttle(STRICT_WALK_IN_THROTTLE)
  walkIn(@CurrentKiosk() k: Kiosk, @Body() dto: KioskWalkInDto) {
    return this.walkIns.kioskWalkIn(k, dto);
  }

  @Get('walk-ins/:id')
  status(@CurrentKiosk() k: Kiosk, @Param('id', ParseUUIDPipe) id: string) {
    return this.walkIns.kioskStatus(k, id);
  }

  @Post('pass')
  @HttpCode(200)
  @Throttle(STRICT_WALK_IN_THROTTLE)
  pass(@CurrentKiosk() k: Kiosk, @Body() dto: PassDto) {
    return this.walkIns.kioskPass(k, dto.code);
  }

  @Post('visits/:id/check-in')
  @HttpCode(200)
  checkIn(@CurrentKiosk() k: Kiosk, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AcceptedDto) {
    return this.walkIns.kioskCheckIn(k, id, dto);
  }
}
