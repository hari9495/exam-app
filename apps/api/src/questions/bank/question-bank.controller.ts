import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { OwnSessionGuard } from '../../auth/own-session.guard';
import { CurrentTenant } from '../../auth/current-tenant.decorator';
import { PermissionsGuard } from '../../rbac/permissions.guard';
import { RequirePermissions } from '../../rbac/permissions.decorator';
import { SeesAnswerKeys, ShowsAnswerKeys, withoutAnswerKey } from '../../rbac/answer-keys';
import { CreateQuestionDto } from '../dto/create-question.dto';
import { QuestionBankService, type Who } from './question-bank.service';
import type { QuestionContent } from './bank-rules';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/** A question as written in the bank: the existing payload plus alt text for its images. */
export class BankQuestionDto extends CreateQuestionDto {
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(500)
  imageAlt?: string;

  /** By option order; '' when an option has no image. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  optionAlts?: string[];
}

export class BankListQueryDto {
  @IsOptional()
  @IsIn(['draft', 'in_review', 'approved', 'retired'])
  status?: 'draft' | 'in_review' | 'approved' | 'retired';

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(200)
  collection?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(200)
  search?: string;
}

export class ReviewDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  rowVersion!: number;

  @IsOptional()
  @IsObject()
  comments?: Record<string, string>;
}

export class ChangesDto extends ReviewDto {
  @trim()
  @IsString()
  @MinLength(5, { message: 'Say what to change (at least 5 characters).' })
  @MaxLength(1000)
  note!: string;
}

export class TranslationDto {
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  text!: string;

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(2000, { each: true })
  options!: string[];

  @IsOptional()
  @IsBoolean()
  aiAssisted?: boolean;
}

export class TranslationDecisionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  rowVersion!: number;

  @IsBoolean()
  approve!: boolean;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

/** A question without its answer key, unless this person may see keys (never while acting for someone else). */
const keyed = <C extends QuestionContent | null>(c: C, keys: boolean): C => (c && !keys ? withoutAnswerKey(c) : c);

const who = (req: Request, ctx: TenantContext): Who => ({ ctx, userId: (req.user as { userId: string }).userId });

/**
 * Assessments AS-1 (answers 2009, 2010): the designed question bank (PRC-01, PRC-02, PRC-03). The bank shows answer
 * keys, so every route needs the writers' key; changes are never made while acting for someone else.
 * TODO(AS-0): replace question_bank:manage with asmt.bank.manage (the older key stays as its alias).
 */
@Controller('question-bank')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('question_bank:manage')
export class QuestionBankController {
  constructor(private readonly bank: QuestionBankService) {}

  @Get('settings')
  settings(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.bank.settings(who(req, ctx));
  }

  @Get('questions')
  list(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: BankListQueryDto) {
    return this.bank.list(who(req, ctx), q);
  }

  @Get('questions/:id')
  @ShowsAnswerKeys()
  async get(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @SeesAnswerKeys() keys: boolean) {
    const q = await this.bank.get(who(req, ctx), id);
    return { ...q, content: keyed(q.content, keys), openChange: q.openChange && { ...q.openChange, content: keyed(q.openChange.content, keys) } };
  }

  @Post('questions')
  @UseGuards(OwnSessionGuard)
  create(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: BankQuestionDto) {
    return this.bank.create(who(req, ctx), dto);
  }

  @Put('questions/:id')
  @UseGuards(OwnSessionGuard)
  save(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: BankQuestionDto) {
    return this.bank.save(who(req, ctx), id, dto);
  }

  @Post('questions/:id/submit')
  @HttpCode(200)
  @UseGuards(OwnSessionGuard)
  submit(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.bank.submit(who(req, ctx), id);
  }

  @Post('questions/:id/withdraw')
  @HttpCode(204)
  @UseGuards(OwnSessionGuard)
  async withdraw(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.bank.withdraw(who(req, ctx), id);
  }

  @Get('reviews')
  @ShowsAnswerKeys()
  async queue(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @SeesAnswerKeys() keys: boolean) {
    const q = await this.bank.queue(who(req, ctx));
    return { ...q, changes: q.changes.map((c) => ({ ...c, before: keyed(c.before, keys), after: keyed(c.after, keys) })) };
  }

  @Post('reviews/:id/approve')
  @HttpCode(200)
  @UseGuards(OwnSessionGuard)
  approve(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewDto) {
    return this.bank.approve(who(req, ctx), id, dto.rowVersion, dto.comments ?? {});
  }

  @Post('reviews/:id/changes')
  @HttpCode(204)
  @UseGuards(OwnSessionGuard)
  async changes(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ChangesDto) {
    await this.bank.requestChanges(who(req, ctx), id, dto.rowVersion, dto.note, dto.comments ?? {});
  }

  @Post('reviews/:id/not-duplicate')
  @HttpCode(204)
  @UseGuards(OwnSessionGuard)
  async notDuplicate(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewDto) {
    await this.bank.clearDuplicate(who(req, ctx), id, dto.rowVersion);
  }

  @Put('questions/:id/translations/:lang')
  @HttpCode(204)
  @UseGuards(OwnSessionGuard)
  async saveTranslation(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('lang') lang: string, @Body() dto: TranslationDto) {
    await this.bank.saveTranslation(who(req, ctx), id, lang, dto);
  }

  @Post('questions/:id/translations/:lang/submit')
  @HttpCode(204)
  @UseGuards(OwnSessionGuard)
  async submitTranslation(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('lang') lang: string) {
    await this.bank.submitTranslation(who(req, ctx), id, lang);
  }

  @Post('translations/:id/decide')
  @HttpCode(204)
  @UseGuards(OwnSessionGuard)
  async decideTranslation(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TranslationDecisionDto) {
    await this.bank.decideTranslation(who(req, ctx), id, dto.rowVersion, dto.approve, dto.note);
  }
}
