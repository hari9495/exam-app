import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Request, Response } from 'express';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min } from 'class-validator';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import type { ScopeUser } from '../access/scope';
import { ContractComplianceService, DOCUMENT_KINDS, PROOF_TYPES, type ProofType } from './contract-compliance.service';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const MONEY = /^\d{1,12}(\.\d{1,2})?$/;
const UPLOAD = FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
const fileOf = (f?: Express.Multer.File) => (f ? { name: f.originalname, data: f.buffer } : undefined);

export class MonthQueryDto {
  @Matches(MONTH)
  month!: string;

  @IsOptional()
  @IsUUID()
  legalEntityId?: string;
}

export class YearQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @IsOptional()
  @IsUUID()
  legalEntityId?: string;
}

export class RegisterFileQueryDto {
  @IsIn(['contractors', 'workmen'])
  kind!: string;

  @IsUUID()
  siteId!: string;

  @IsOptional()
  @IsUUID()
  contractorId?: string;

  @Matches(MONTH)
  month!: string;
}

export class SiteMonthQueryDto {
  @IsUUID()
  siteId!: string;

  @Matches(MONTH)
  month!: string;
}

export class SiteYearQueryDto {
  @IsUUID()
  siteId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;
}

export class MinWageQueryDto {
  @IsUUID()
  locationId!: string;

  @IsIn(['unskilled', 'semi_skilled', 'skilled'])
  skill!: string;

  @Matches(DAY)
  on!: string;
}

export class ExportQueryDto {
  @IsIn(['csv', 'xlsx'])
  format!: 'csv' | 'xlsx';

  @IsOptional()
  @IsUUID()
  legalEntityId?: string;
}

export class IdentifiersDto {
  // M01 YX-EMP-01: 12 digits, never starting 0 or 1 (the checksum is checked with validator.js on the person record).
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
}

export class RevealDto {
  @IsIn(['aadhaar', 'uan', 'esic'])
  field!: 'aadhaar' | 'uan' | 'esic';
}

export class ContractorCodesDto {
  @IsOptional()
  @Matches(/^[0-9]{2}[A-Z0-9]{13}$/, { message: 'A GSTIN is 15 characters, starting with the state code' })
  gstin?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(30)
  pfCode?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(30)
  esicCode?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(20)
  lin?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(100)
  contact?: string;

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';
}

export class DocumentDto {
  @IsIn([...DOCUMENT_KINDS])
  kind!: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(60)
  number?: string;

  @IsOptional()
  @Matches(DAY)
  validFrom?: string;

  @IsOptional()
  @Matches(DAY)
  validTo?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class DecisionDto {
  @IsIn(['verified', 'rejected', 'discrepancy'])
  decision!: 'verified' | 'rejected' | 'discrepancy';

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ProofDto {
  @IsUUID()
  contractorId!: string;

  @Matches(MONTH)
  month!: string;

  @IsIn([...PROOF_TYPES])
  proofType!: ProofType;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(60)
  reference?: string;

  @IsOptional()
  @Matches(MONEY)
  amount?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  workersCovered?: number;

  @IsOptional()
  @Matches(DAY)
  paidOn?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  notRequired?: boolean;
}

export class BillReleaseDto {
  @IsUUID()
  contractorId!: string;

  @Matches(MONTH)
  month!: string;

  @trim()
  @IsString()
  @Length(10, 500, { message: 'Give the reason in a sentence (at least 10 characters).' })
  reason!: string;
}

export class AlertNoteDto {
  @IsString()
  @MaxLength(160)
  key!: string;

  @trim()
  @IsString()
  @Length(3, 500)
  note!: string;
}

const send = (res: Response, out: { file: Buffer; name: string }) => {
  const type = out.name.endsWith('.zip') ? 'application/zip' : out.name.endsWith('.csv') ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  res.set({ 'Content-Type': type, 'Content-Disposition': `attachment; filename="${out.name}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  return new StreamableFile(out.file);
};

// Contract labour part 2 (founder decision 21 Oct 2026): vendor compliance, CLRA registers and returns, reports, and a
// worker's identifiers. Every route declares its key; the service checks the key's reach for each record.
@Controller('contract-labour')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ContractComplianceController {
  constructor(private readonly svc: ContractComplianceService) {}

  private user(req: Request) {
    return req.user as ScopeUser;
  }

  @Patch('contractors/:id')
  @RequirePermissions('clra.worker.manage')
  updateContractor(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ContractorCodesDto) {
    return this.svc.updateContractor(ctx, this.user(req), id, dto);
  }

  @Get('contractors/:id/documents')
  @RequirePermissions('clra.worker.view')
  documents(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.documents(ctx, this.user(req), id);
  }

  @Post('contractors/:id/documents')
  @RequirePermissions('clra.worker.manage')
  @UseInterceptors(UPLOAD)
  addDocument(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DocumentDto, @UploadedFile() file?: Express.Multer.File) {
    return this.svc.addDocument(ctx, this.user(req), id, dto, fileOf(file));
  }

  @Post('documents/:id/decision')
  @HttpCode(200)
  @RequirePermissions('clra.compliance.manage')
  decideDocument(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecisionDto) {
    return this.svc.decideDocument(ctx, this.user(req), id, dto.decision === 'rejected' ? 'rejected' : 'verified', dto.note);
  }

  @Get('compliance')
  @RequirePermissions('clra.worker.view')
  compliance(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: MonthQueryDto) {
    return this.svc.compliance(ctx, this.user(req), q.month, q.legalEntityId ?? null);
  }

  @Post('proofs')
  @RequirePermissions('clra.worker.manage')
  @UseInterceptors(UPLOAD)
  addProof(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: ProofDto, @UploadedFile() file?: Express.Multer.File) {
    return this.svc.addProof(ctx, this.user(req), dto, fileOf(file));
  }

  @Get('proofs/:id')
  @RequirePermissions('clra.worker.view')
  proof(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.proof(ctx, this.user(req), id);
  }

  @Post('proofs/:id/decision')
  @HttpCode(200)
  @RequirePermissions('clra.compliance.manage')
  decideProof(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecisionDto) {
    return this.svc.decideProof(ctx, this.user(req), id, dto.decision === 'verified' ? 'verified' : 'discrepancy', dto.note);
  }

  @Post('bill-releases')
  @RequirePermissions('clra.compliance.manage')
  releaseBill(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: BillReleaseDto) {
    return this.svc.releaseBill(ctx, this.user(req), dto);
  }

  @Post('alerts/resolve')
  @HttpCode(200)
  @RequirePermissions('clra.compliance.manage')
  resolveAlert(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: AlertNoteDto) {
    return this.svc.resolveAlert(ctx, this.user(req), dto.key, dto.note);
  }

  @Get('registers')
  @RequirePermissions('clra.worker.view')
  registers(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: MonthQueryDto) {
    return this.svc.registers(ctx, this.user(req), q.month, q.legalEntityId ?? null);
  }

  @Get('registers/file')
  @RequirePermissions('clra.worker.view')
  async registerFile(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: RegisterFileQueryDto, @Res({ passthrough: true }) res: Response) {
    return send(res, await this.svc.registerFile(ctx, this.user(req), q.kind, q.siteId, q.contractorId ?? null, q.month));
  }

  @Get('registers/inspection-pack')
  @RequirePermissions('clra.worker.view')
  async inspectionPack(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: SiteMonthQueryDto, @Res({ passthrough: true }) res: Response) {
    return send(res, await this.svc.inspectionPack(ctx, this.user(req), q.siteId, q.month));
  }

  @Get('returns')
  @RequirePermissions('clra.worker.view')
  returns(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: YearQueryDto) {
    return this.svc.returns(ctx, this.user(req), q.year, q.legalEntityId ?? null);
  }

  @Get('returns/file')
  @RequirePermissions('clra.worker.view')
  async returnFile(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: SiteYearQueryDto, @Res({ passthrough: true }) res: Response) {
    return send(res, await this.svc.returnFile(ctx, this.user(req), q.siteId, q.year));
  }

  @Get('reports')
  @RequirePermissions('clra.worker.view')
  reports(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: MonthQueryDto) {
    return this.svc.reports(ctx, this.user(req), q.month, q.legalEntityId ?? null);
  }

  @Get('minimum-wage')
  @RequirePermissions('clra.worker.view')
  minimumWage(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: MinWageQueryDto) {
    return this.svc.minimumWage(ctx, this.user(req), q.locationId, q.skill, q.on);
  }

  @Get('workers/export')
  @RequirePermissions('clra.worker.view')
  async exportWorkers(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: ExportQueryDto, @Res({ passthrough: true }) res: Response) {
    return send(res, await this.svc.exportWorkers(ctx, this.user(req), q.format, q.legalEntityId ?? null));
  }

  @Patch('workers/:id/identifiers')
  @RequirePermissions('clra.worker.manage')
  setIdentifiers(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: IdentifiersDto) {
    return this.svc.setIdentifiers(ctx, this.user(req), id, dto);
  }

  @Post('workers/:id/reveal')
  @HttpCode(200)
  @RequirePermissions('clra.identity.view')
  reveal(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RevealDto) {
    return this.svc.reveal(ctx, this.user(req), id, dto.field);
  }
}
