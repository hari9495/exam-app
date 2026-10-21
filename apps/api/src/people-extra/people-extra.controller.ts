import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { RequireStepUp } from '../auth/step-up.decorator';
import { ownSession } from '../org-structure/org-structure.controller';
import type { RequestUser } from '../employee-history/employee-history.service';
import { RecordsService } from './records.service';
import { DisabilityService } from './disability.service';
import { MergeService } from './merge.service';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CheckDto {
  @IsString() @MinLength(3) @MaxLength(60) point!: string;
  @IsIn(['match', 'mismatch', 'attested', 'id_only', 'requested']) result!: 'match' | 'mismatch' | 'attested' | 'id_only' | 'requested';
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(60) jurisdiction?: string | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsIn(['given', 'refused']) consent?: 'given' | 'refused' | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(500) note?: string | null;
}
export class WorkAuthDto {
  @Matches(/^[A-Z]{2}$/) country!: string;
  @IsString() @MaxLength(40) type!: string;
  @Matches(/^[A-Za-z0-9 /-]{4,30}$/, { message: 'number is 4 to 30 letters and digits' }) number!: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(120) sponsor?: string | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(120) occupation?: string | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(DATE) issuedOn?: string | null;
  @Matches(DATE) expiresOn!: string;
}
export class SplitAccountDto {
  @IsIn(['iban', 'india']) kind!: 'iban' | 'india';
  @IsOptional() @IsString() @MaxLength(40) iban?: string;
  @IsOptional() @IsString() @MaxLength(11) bic?: string;
  @IsOptional() @IsString() @MaxLength(80) bankName?: string;
  @IsOptional() @IsUUID() bankAccountId?: string;
  @IsIn(['remainder', 'fixed', 'percent']) rule!: 'remainder' | 'fixed' | 'percent';
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100_000_000) value!: number;
}
export class IntlBankDto {
  @Matches(/^[A-Z]{2}$/) country!: string;
  @Matches(/^[A-Z]{3}$/) currency!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(3) @ValidateNested({ each: true }) @Type(() => SplitAccountDto) accounts!: SplitAccountDto[];
}
export class DecideDto {
  @IsBoolean() approve!: boolean;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(500) note?: string | null;
  @IsInt() @Min(1) version!: number;
}
export class DisabilityDto {
  @IsBoolean() consent!: boolean;
  @IsString() @MaxLength(60) category!: string;
  @IsInt() @Min(1) @Max(100) percent!: number;
  @IsUUID() certificateDocumentId!: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(DATE) validUntil?: string | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(1000) adjustments?: string | null;
}
export class VersionDto {
  @IsInt() @Min(1) version!: number;
}
export class PicksDto {
  @IsIn(['a', 'b']) name!: 'a' | 'b';
  @IsIn(['a', 'b']) email!: 'a' | 'b';
  @IsIn(['a', 'b']) phone!: 'a' | 'b';
}
export class MergeDto {
  @IsUUID() keepPersonId!: string;
  @IsUUID() mergePersonId!: string;
  @ValidateNested() @Type(() => PicksDto) picks!: PicksDto;
  @IsString() @MinLength(5) @MaxLength(1000) note!: string;
}
export class NoteDto {
  @IsString() @MinLength(5) @MaxLength(1000) note!: string;
}
export class PersonSearchDto {
  @IsString() @MinLength(2) @MaxLength(80) q!: string;
  @IsOptional() @IsUUID() not?: string;
}
export class CompareDto {
  @IsUUID() keep!: string;
  @IsUUID() merge!: string;
}

// The person record's identity checks (PPL-34), work authorisations (PPL-45) and international bank details with split
// pay (PPL-46); the disability declaration (PPL-38); merging two records of one person (PPL-37). The routes need a
// session; every key and the person's reach are checked in the services (the person sees and raises their own).
@Controller('people')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PeopleExtraController {
  constructor(
    private readonly records: RecordsService,
    private readonly disability: DisabilityService,
    private readonly merges: MergeService,
  ) {}

  private user(req: Request) {
    return req.user as RequestUser;
  }

  // ---- PPL-34 identity

  @Get('employees/:id/identity')
  @RequirePermissions('employee.identity.view')
  identity(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.records.identity(ctx, this.user(req), id);
  }

  @Post('employees/:id/identity/checks')
  @RequirePermissions('employee.identity.manage')
  check(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CheckDto) {
    ownSession(req);
    return this.records.recordCheck(ctx, this.user(req), id, dto);
  }

  // ---- PPL-45 work authorisations (the person sees their own)

  @Get('employees/:id/work-auth')
  workAuth(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.records.workAuth(ctx, this.user(req), id);
  }

  @Post('employees/:id/work-auth')
  @RequirePermissions('employee.identity.manage')
  addWorkAuth(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: WorkAuthDto) {
    ownSession(req);
    return this.records.addWorkAuth(ctx, this.user(req), id, dto);
  }

  // ---- PPL-46 international bank (the person raises their own change)

  @Get('employees/:id/intl-bank')
  intlBank(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.records.intlBank(ctx, this.user(req), id);
  }

  @Post('employees/:id/intl-bank')
  requestIntlBank(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: IntlBankDto) {
    ownSession(req);
    return this.records.requestIntlBank(ctx, this.user(req), id, dto);
  }

  /** Approving where pay goes: a fresh second factor, as for Indian bank changes. */
  @Post('employees/:id/intl-bank/:requestId/decide')
  @HttpCode(200)
  @RequirePermissions('employee.identity.approve')
  @RequireStepUp()
  decideIntlBank(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('requestId', ParseUUIDPipe) requestId: string, @Body() dto: DecideDto) {
    ownSession(req);
    return this.records.decideIntlBank(ctx, this.user(req), id, requestId, dto);
  }

  // ---- PPL-38 disability (the person's own; the HR diversity role's list)

  @Get('me/disability')
  myDisability(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.disability.mine(ctx, this.user(req));
  }

  @Post('me/disability')
  declare(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: DisabilityDto) {
    ownSession(req);
    return this.disability.declare(ctx, this.user(req), dto);
  }

  @Post('me/disability/withdraw')
  @HttpCode(200)
  withdraw(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    ownSession(req);
    return this.disability.withdraw(ctx, this.user(req));
  }

  @Get('disability')
  @RequirePermissions('employee.disability.manage')
  disabilityList(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.disability.list(ctx, this.user(req));
  }

  @Post('disability/:id/verify')
  @HttpCode(200)
  @RequirePermissions('employee.disability.manage')
  verify(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VersionDto) {
    ownSession(req);
    return this.disability.verify(ctx, this.user(req), id, dto.version);
  }

  // ---- PPL-37 merge and unmerge (company-wide HR)

  @Get('merges/persons')
  @RequirePermissions('employee.change.manage')
  persons(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: PersonSearchDto) {
    return this.merges.search(ctx, this.user(req), q.q, q.not ?? null);
  }

  @Get('merges/compare')
  @RequirePermissions('employee.change.manage')
  compare(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: CompareDto) {
    return this.merges.compare(ctx, this.user(req), q.keep, q.merge);
  }

  @Get('merges')
  @RequirePermissions('employee.change.manage')
  mergeList(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.merges.list(ctx, this.user(req));
  }

  @Get('merges/:id')
  @RequirePermissions('employee.change.manage')
  mergeOne(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.merges.get(ctx, this.user(req), id);
  }

  /** A merge rewrites who owns many records: a fresh second factor (P12 YX-IAM-02). */
  @Post('merges')
  @RequirePermissions('employee.change.manage')
  @RequireStepUp()
  merge(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: MergeDto) {
    ownSession(req);
    return this.merges.merge(ctx, this.user(req), dto);
  }

  @Post('merges/:id/unmerge')
  @HttpCode(200)
  @RequirePermissions('employee.change.manage')
  @RequireStepUp()
  unmerge(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: NoteDto) {
    ownSession(req);
    return this.merges.unmerge(ctx, this.user(req), id, dto.note);
  }
}
