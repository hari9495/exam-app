import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Post, Put, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { memoryStorage } from 'multer';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { MODERATE_UPLOAD_THROTTLE } from '../rate-limit-tiers';
import { ownSession } from '../org-structure/org-structure.controller';
import { EmployeeHistoryService, RequestUser } from '../employee-history/employee-history.service';
import { ImportFileProblem, MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, readImportFile } from './employee-import';
import { EmployeeImportService } from './employee-import.service';
import { EmployeeImportDraftsService } from './employee-import-drafts.service';

// Every cell is checked again here and by the hire path; the browser's matching is only a convenience.
export class ImportValuesDto {
  @IsOptional() @IsString() @MaxLength(200) code?: string;
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(200) pan?: string;
  @IsOptional() @IsString() @MaxLength(200) manager?: string;
  @IsOptional() @IsString() @MaxLength(200) joined?: string;
  @IsOptional() @IsString() @MaxLength(200) department?: string;
  @IsOptional() @IsString() @MaxLength(200) designation?: string;
  @IsOptional() @IsString() @MaxLength(200) location?: string;
  @IsOptional() @IsString() @MaxLength(200) type?: string;
  @IsOptional() @IsString() @MaxLength(200) status?: string;
  @IsOptional() @IsString() @MaxLength(200) email?: string;
  @IsOptional() @IsString() @MaxLength(200) mobile?: string;
}

export class ImportRowDto {
  @IsInt() @Min(2) @Max(1_000_000) row!: number;
  @IsObject() @ValidateNested() @Type(() => ImportValuesDto) values!: ImportValuesDto;
}

export class EmployeeImportDto {
  @IsUUID() legalEntityId!: string;
  @IsString() @MinLength(1) @MaxLength(200) fileName!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(MAX_IMPORT_ROWS) @ValidateNested({ each: true }) @Type(() => ImportRowDto) rows!: ImportRowDto[];
}

// A saved import ("Save and exit"): the file as the API read it, the matching and the fixes. Same limits as the file.
export class DraftColumnDto {
  @IsString() @MaxLength(200) column!: string;
  @IsString() @MaxLength(200) sample!: string;
  @IsOptional() @IsString() @MaxLength(20) field!: string | null;
}

export class DraftRowDto {
  @IsInt() @Min(2) @Max(1_000_000) row!: number;
  @IsArray() @ArrayMaxSize(40) @IsString({ each: true }) @MaxLength(200, { each: true }) cells!: string[];
}

export class DraftFileDto {
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(40) @ValidateNested({ each: true }) @Type(() => DraftColumnDto) columns!: DraftColumnDto[];
  @IsArray() @ArrayMaxSize(MAX_IMPORT_ROWS) @ValidateNested({ each: true }) @Type(() => DraftRowDto) rows!: DraftRowDto[];
}

export class ImportDraftDto {
  @IsUUID() legalEntityId!: string;
  @IsIn(['upload', 'map', 'validate', 'review']) step!: 'upload' | 'map' | 'validate' | 'review';
  @ValidateNested() @Type(() => DraftFileDto) file!: DraftFileDto;
  @IsObject() mapping!: Record<string, string>;
  @IsObject() edits!: Record<string, Record<string, string>>;
}

const UPLOAD = FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_IMPORT_BYTES, files: 1 } });

// People › Import (PPL-07). employee.change.manage, as for "Add employee"; the hire path checks its scope per row.
@Controller('people/employee-import')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EmployeeImportController {
  constructor(
    private readonly imports: EmployeeImportService,
    private readonly history: EmployeeHistoryService,
    private readonly drafts: EmployeeImportDraftsService,
  ) {}

  /** Reads the file's columns and rows. Nothing is kept: the browser sends the matched rows back to check. */
  @Post('read')
  @HttpCode(200)
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  @RequirePermissions('employee.change.manage')
  @UseInterceptors(UPLOAD)
  async read(@Req() req: Request, @UploadedFile() file: Express.Multer.File | undefined) {
    ownSession(req);
    if (!file) throw new BadRequestException('Choose a file to upload.');
    try {
      return await readImportFile(file.buffer, file.originalname);
    } catch (e) {
      if (e instanceof ImportFileProblem) throw new BadRequestException(e.message);
      throw e;
    }
  }

  /** Every row checked through the real hire path, then rolled back. */
  @Post('check')
  @HttpCode(200)
  @RequirePermissions('employee.change.manage')
  async check(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: EmployeeImportDto) {
    ownSession(req);
    return this.imports.run(ctx, await this.history.viewer(req.user as RequestUser), dto.legalEntityId, dto.fileName, dto.rows, false);
  }

  /** Creates the rows that pass; the rest are skipped and listed. */
  @Post()
  @HttpCode(200)
  @RequirePermissions('employee.change.manage')
  async import(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: EmployeeImportDto) {
    ownSession(req);
    const out = await this.imports.run(ctx, await this.history.viewer(req.user as RequestUser), dto.legalEntityId, dto.fileName, dto.rows, true);
    // Imported: the person's saved import has done its job.
    await this.drafts.discard(ctx);
    return out;
  }

  // ---- "Save and exit" (one saved import per person; nobody else reads it) ----

  @Get('draft')
  @RequirePermissions('employee.change.manage')
  draft(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    ownSession(req);
    return this.drafts.mine(ctx);
  }

  @Get('draft/content')
  @RequirePermissions('employee.change.manage')
  draftContent(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    ownSession(req);
    return this.drafts.open(ctx);
  }

  @Put('draft')
  @RequirePermissions('employee.change.manage')
  saveDraft(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: ImportDraftDto) {
    ownSession(req);
    return this.drafts.save(ctx, dto);
  }

  @Delete('draft')
  @RequirePermissions('employee.change.manage')
  discardDraft(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    ownSession(req);
    return this.drafts.discard(ctx);
  }
}
