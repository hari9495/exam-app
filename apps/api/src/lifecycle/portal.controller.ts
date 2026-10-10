import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import { MODERATE_UPLOAD_THROTTLE, PUBLIC_API_THROTTLE, STRICT_AUTH_THROTTLE } from '../rate-limit-tiers';
import { LetterFileQueryDto } from '../documents/letters/dto';
import { BankSectionDto, BgvConsentDto, EmergencySectionDto, IdentitySectionDto, NomineesSectionDto, PersonalSectionDto, PortalCodeDto, PortalEmailDto, PortalSignDto, PortalVerifyDto, TaxSectionDto } from './portal-dto';
import { PreboardingPortalService } from './portal.service';

// The pre-boarding portal (T9-01, LIFE-2.01 / 2.02), outside the staff app: a one-time code to the joiner's personal
// email, then a session token in the X-Join-Portal header. Every route works only for that one joiner.
const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;
const slugOf = (s: string) => (SLUG.test(s) ? s : '-');
const meta = (req: Request) => ({ ip: req.ip ?? null, device: String(req.headers['user-agent'] ?? '').slice(0, 200) || null });

@Controller('portal/join/:org')
@Throttle(PUBLIC_API_THROTTLE)
export class PreboardingPortalController {
  constructor(private readonly portal: PreboardingPortalService) {}

  @Post('code')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  code(@Req() req: Request, @Param('org') org: string, @Body() dto: PortalEmailDto) {
    return this.portal.code(slugOf(org), dto.email, req.ip ?? null, dto.challengeToken);
  }

  @Post('verify')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  verify(@Param('org') org: string, @Body() dto: PortalVerifyDto) {
    return this.portal.verify(slugOf(org), dto.email, dto.code);
  }

  @Post('sign-out')
  @HttpCode(200)
  signOut(@Param('org') org: string, @Headers('x-join-portal') token?: string) {
    return this.portal.signOut(slugOf(org), token);
  }

  @Get('me')
  me(@Param('org') org: string, @Headers('x-join-portal') token?: string) {
    return this.portal.me(slugOf(org), token);
  }

  @Post('step-up/code')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  stepUpCode(@Req() req: Request, @Param('org') org: string, @Headers('x-join-portal') token?: string) {
    return this.portal.stepUpCode(slugOf(org), token, req.ip ?? null);
  }

  @Post('step-up')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  stepUp(@Param('org') org: string, @Body() dto: PortalCodeDto, @Headers('x-join-portal') token?: string) {
    return this.portal.stepUp(slugOf(org), token, dto.code);
  }

  @Put('sections/personal')
  personal(@Param('org') org: string, @Body() dto: PersonalSectionDto, @Headers('x-join-portal') token?: string) {
    return this.portal.saveSection(slugOf(org), token, 'personal', dto);
  }

  @Put('sections/identity')
  identity(@Param('org') org: string, @Body() dto: IdentitySectionDto, @Headers('x-join-portal') token?: string) {
    return this.portal.saveSection(slugOf(org), token, 'identity', dto);
  }

  @Put('sections/bank')
  bank(@Param('org') org: string, @Body() dto: BankSectionDto, @Headers('x-join-portal') token?: string) {
    return this.portal.saveSection(slugOf(org), token, 'bank', dto);
  }

  @Put('sections/emergency')
  emergency(@Param('org') org: string, @Body() dto: EmergencySectionDto, @Headers('x-join-portal') token?: string) {
    return this.portal.saveSection(slugOf(org), token, 'emergency', dto);
  }

  @Put('sections/nominees')
  nominees(@Param('org') org: string, @Body() dto: NomineesSectionDto, @Headers('x-join-portal') token?: string) {
    return this.portal.saveSection(slugOf(org), token, 'nominees', dto);
  }

  @Put('sections/tax')
  tax(@Param('org') org: string, @Body() dto: TaxSectionDto, @Headers('x-join-portal') token?: string) {
    return this.portal.saveSection(slugOf(org), token, 'tax', dto);
  }

  @Post('documents/:typeKey')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 1 } }))
  upload(@Param('org') org: string, @Param('typeKey') typeKey: string, @UploadedFile() file: Express.Multer.File | undefined, @Headers('x-join-portal') token?: string) {
    return this.portal.upload(slugOf(org), token, typeKey.slice(0, 40), file);
  }

  @Post('bgv-consent')
  @HttpCode(200)
  bgv(@Req() req: Request, @Param('org') org: string, @Body() dto: BgvConsentDto, @Headers('x-join-portal') token?: string) {
    return this.portal.bgvConsent(slugOf(org), token, dto, meta(req));
  }

  @Get('letters/:id/file')
  async letterFile(@Res({ passthrough: true }) res: Response, @Param('org') org: string, @Param('id', ParseUUIDPipe) id: string, @Query() q: LetterFileQueryDto, @Headers('x-join-portal') token?: string) {
    const f = await this.portal.letterFile(slugOf(org), token, id, q.which ?? 'letter');
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${f.name.replace(/[^A-Za-z0-9._-]/g, '_')}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
    return new StreamableFile(f.file);
  }

  @Post('letters/:id/sign/code')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  signCode(@Req() req: Request, @Param('org') org: string, @Param('id', ParseUUIDPipe) id: string, @Headers('x-join-portal') token?: string) {
    return this.portal.signCode(slugOf(org), token, id, req.ip ?? null);
  }

  @Post('letters/:id/sign')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  sign(@Req() req: Request, @Param('org') org: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PortalSignDto, @Headers('x-join-portal') token?: string) {
    return this.portal.sign(slugOf(org), token, id, dto, meta(req));
  }
}
