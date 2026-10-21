import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import type { ScopeUser } from '../access/scope';
import { WorkforceRolesService } from './workforce-roles.service';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONEY = /^\d{1,10}(\.\d{1,2})?$/;

export class EntityQueryDto {
  @IsOptional()
  @IsUUID()
  legalEntityId?: string;
}

class PersonDto {
  @IsOptional()
  @IsUUID()
  personId?: string;

  @IsOptional()
  @trim()
  @IsString()
  @Length(1, 100)
  givenName?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(100)
  familyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(254)
  email?: string;
}

export class LicenceDto {
  @trim()
  @IsString()
  @Length(3, 50)
  licenceNo!: string;

  @IsUUID()
  locationId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(36)
  @Matches(/^IN-[A-Z]{2}$/, { each: true })
  states!: string[];

  @IsInt()
  @Min(1)
  @Max(100000)
  maxWorkers!: number;

  @Matches(DAY)
  validFrom!: string;

  @Matches(DAY)
  validTo!: string;
}

export class ContractorDto {
  @IsUUID()
  legalEntityId!: string;

  @trim()
  @IsString()
  @Length(2, 150)
  name!: string;

  @trim()
  @IsString()
  @Length(2, 100)
  work!: string;

  @IsOptional()
  @Matches(/^[A-Z]{5}[0-9]{4}[A-Z]$/, { message: 'A PAN is 5 letters, 4 digits and a letter.' })
  pan?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(100)
  contact?: string;

  @ValidateNested()
  @Type(() => LicenceDto)
  licence!: LicenceDto;
}

export class DeployDto extends PersonDto {
  @IsOptional()
  @Matches(/^[2-9][0-9]{11}$/, { message: 'Aadhaar is 12 digits' })
  aadhaar?: string;

  @IsOptional()
  @Matches(/^[0-9]{12}$/, { message: 'UAN is 12 digits' })
  uan?: string;

  @IsOptional()
  @Matches(/^([0-9]{10}|[0-9]{17})$/, { message: 'The ESI IP number is 10 digits' })
  esic?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(30)
  gatePass?: string;

  @IsOptional()
  @Matches(DAY)
  gatePassValidTo?: string;

  @IsUUID()
  contractorId!: string;

  @IsUUID()
  licenceId!: string;

  @IsUUID()
  locationId!: string;

  @Matches(DAY)
  dateOfBirth!: string;

  @trim()
  @IsString()
  @Length(2, 80)
  work!: string;

  @IsIn(['unskilled', 'semi_skilled', 'skilled'])
  skill!: 'unskilled' | 'semi_skilled' | 'skilled';

  @IsOptional()
  @Matches(MONEY)
  wage?: string;

  @Matches(DAY)
  fromOn!: string;
}

export class PlacementDto extends PersonDto {
  @IsUUID()
  legalEntityId!: string;

  @trim()
  @IsString()
  @Length(2, 150)
  client!: string;

  @trim()
  @IsString()
  @Length(2, 100)
  role!: string;

  @Matches(DAY)
  startOn!: string;

  @Matches(DAY)
  endOn!: string;

  @Matches(MONEY)
  billRate!: string;

  @Matches(MONEY)
  payRate!: string;

  @IsOptional()
  @Matches(MONEY)
  statutoryPerHour?: string;

  @IsIn(['own', 'vendor'])
  supply!: 'own' | 'vendor';

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(150)
  vendor?: string;
}

export class EndPlacementDto {
  @Matches(DAY)
  endedOn!: string;

  @trim()
  @IsString()
  @Length(3, 500)
  reason!: string;
}

// Contract workers and placements (founder decision 21 Oct 2026). Every route declares its key; the service checks the
// key's reach (company, legal entity or site) for each record, and the database keeps support sessions out.
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WorkforceRolesController {
  constructor(private readonly roles: WorkforceRolesService) {}

  private user(req: Request) {
    return req.user as ScopeUser;
  }

  @Get('contract-labour/contractors')
  @RequirePermissions('clra.worker.view')
  contractors(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: EntityQueryDto) {
    return this.roles.contractors(ctx, this.user(req), q.legalEntityId ?? null);
  }

  @Post('contract-labour/contractors')
  @RequirePermissions('clra.worker.manage')
  addContractor(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: ContractorDto) {
    return this.roles.createContractor(ctx, this.user(req), dto);
  }

  @Post('contract-labour/contractors/:id/licences')
  @RequirePermissions('clra.worker.manage')
  addLicence(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LicenceDto) {
    return this.roles.addLicence(ctx, this.user(req), id, dto);
  }

  @Get('contract-labour/workers')
  @RequirePermissions('clra.worker.view')
  workers(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: EntityQueryDto) {
    return this.roles.workers(ctx, this.user(req), q.legalEntityId ?? null);
  }

  @Post('contract-labour/workers')
  @RequirePermissions('clra.worker.manage')
  deploy(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: DeployDto) {
    return this.roles.deploy(ctx, this.user(req), dto);
  }

  @Post('contract-labour/workers/:id/approve')
  @HttpCode(200)
  @RequirePermissions('clra.worker.manage')
  approve(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.roles.decide(ctx, this.user(req), id, 'approve');
  }

  @Post('contract-labour/workers/:id/release')
  @HttpCode(200)
  @RequirePermissions('clra.worker.manage')
  release(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.roles.decide(ctx, this.user(req), id, 'release');
  }

  @Get('staffing/placements')
  @RequirePermissions('staffing.placement.view')
  placements(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: EntityQueryDto) {
    return this.roles.placements(ctx, this.user(req), q.legalEntityId ?? null);
  }

  @Post('staffing/placements')
  @RequirePermissions('staffing.placement.manage')
  addPlacement(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: PlacementDto) {
    return this.roles.createPlacement(ctx, this.user(req), dto);
  }

  @Post('staffing/placements/:id/end')
  @HttpCode(200)
  @RequirePermissions('staffing.placement.manage')
  endPlacement(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EndPlacementDto) {
    return this.roles.endPlacement(ctx, this.user(req), id, dto.endedOn, dto.reason);
  }
}
