import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, Res, StreamableFile } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { PUBLIC_API_THROTTLE, STRICT_AUTH_THROTTLE } from '../rate-limit-tiers';
import { LetterFileQueryDto } from '../documents/letters/dto';
import { PortalEmailDto, PortalVerifyDto } from './portal-dto';
import { AlumniPortalService } from './alumni.service';

// The alumni login (T9-02, LIFE-4.04), outside the staff app: a one-time code to the personal email, then a session
// token in the X-Alumni-Portal header. Read-only: the person's own issued letters.
const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;
const slugOf = (s: string) => (SLUG.test(s) ? s : '-');

@Controller('portal/alumni/:org')
@Throttle(PUBLIC_API_THROTTLE)
export class AlumniPortalController {
  constructor(private readonly alumni: AlumniPortalService) {}

  @Post('code')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  code(@Req() req: Request, @Param('org') org: string, @Body() dto: PortalEmailDto) {
    return this.alumni.code(slugOf(org), dto.email, req.ip ?? null, dto.challengeToken);
  }

  @Post('verify')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  verify(@Param('org') org: string, @Body() dto: PortalVerifyDto) {
    return this.alumni.verify(slugOf(org), dto.email, dto.code);
  }

  @Post('sign-out')
  @HttpCode(200)
  signOut(@Param('org') org: string, @Headers('x-alumni-portal') token?: string) {
    return this.alumni.signOut(slugOf(org), token);
  }

  @Get('me')
  me(@Param('org') org: string, @Headers('x-alumni-portal') token?: string) {
    return this.alumni.me(slugOf(org), token);
  }

  @Get('letters/:id/file')
  async file(@Res({ passthrough: true }) res: Response, @Param('org') org: string, @Param('id', ParseUUIDPipe) id: string, @Query() q: LetterFileQueryDto, @Headers('x-alumni-portal') token?: string) {
    const f = await this.alumni.letterFile(slugOf(org), token, id, q.which ?? 'letter');
    res.set({ 'Content-Type': f.contentType, 'Content-Disposition': `attachment; filename="${f.name.replace(/[^A-Za-z0-9._-]/g, '_')}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
    return new StreamableFile(f.file);
  }
}
