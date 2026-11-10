import { Body, Controller, Get, Headers, HttpCode, Ip, Param, ParseUUIDPipe, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { MODERATE_UPLOAD_THROTTLE, PUBLIC_API_THROTTLE, STRICT_AUTH_THROTTLE } from '../rate-limit-tiers';
import { PortalEmailDto, PortalVerifyDto } from '../staffing/staffing-dto';
import { ContractorPortalService } from './contractor-portal.service';
import { MinWageQueryDto, PackItemDto, PackQueryDto, PortalWorkerDto, RenewalDto } from './clra-dto';

const UPLOAD = FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });

/** CL-3 (T9-13): the contractor portal: a one-time code by email, then a session token in the X-Contractor-Portal header. */
@Controller('public/contractor-portal')
export class PublicContractorPortalController {
  constructor(private readonly portal: ContractorPortalService) {}

  @Post(':org/code')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  code(@Param('org') org: string, @Body() dto: PortalEmailDto, @Ip() ip: string) {
    return this.portal.code(org.slice(0, 100), dto.email, ip ?? null);
  }

  @Post(':org/verify')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  verify(@Param('org') org: string, @Body() dto: PortalVerifyDto) {
    return this.portal.verify(org.slice(0, 100), dto.email, dto.code);
  }

  @Get(':org/me')
  @Throttle(PUBLIC_API_THROTTLE)
  me(@Param('org') org: string, @Headers('x-contractor-portal') token?: string) {
    return this.portal.me(org.slice(0, 100), token);
  }

  @Post(':org/sign-out')
  @HttpCode(200)
  @Throttle(PUBLIC_API_THROTTLE)
  signOut(@Param('org') org: string, @Headers('x-contractor-portal') token?: string) {
    return this.portal.signOut(org.slice(0, 100), token);
  }

  @Post(':org/workers/check')
  @HttpCode(200)
  @Throttle(PUBLIC_API_THROTTLE)
  check(@Param('org') org: string, @Body() dto: PortalWorkerDto, @Headers('x-contractor-portal') token?: string) {
    return this.portal.check(org.slice(0, 100), token, dto);
  }

  @Post(':org/workers')
  @HttpCode(201)
  @Throttle(PUBLIC_API_THROTTLE)
  addWorker(@Param('org') org: string, @Body() dto: PortalWorkerDto, @Headers('x-contractor-portal') token?: string) {
    return this.portal.addWorker(org.slice(0, 100), token, dto);
  }

  @Post(':org/licences/:id/renewal')
  @HttpCode(201)
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  @UseInterceptors(UPLOAD)
  renew(@Param('org') org: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RenewalDto, @UploadedFile() file: Express.Multer.File | undefined, @Headers('x-contractor-portal') token?: string) {
    return this.portal.renew(org.slice(0, 100), token, id, dto, file ? { name: file.originalname, data: file.buffer } : null);
  }

  @Get(':org/packs')
  @Throttle(PUBLIC_API_THROTTLE)
  packs(@Param('org') org: string, @Headers('x-contractor-portal') token?: string) {
    return this.portal.packs(org.slice(0, 100), token);
  }

  @Get(':org/pack')
  @Throttle(PUBLIC_API_THROTTLE)
  pack(@Param('org') org: string, @Query() q: PackQueryDto, @Headers('x-contractor-portal') token?: string) {
    return this.portal.pack(org.slice(0, 100), token, q.locationId, q.month);
  }

  @Post(':org/pack/items')
  @HttpCode(201)
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  @UseInterceptors(UPLOAD)
  upload(@Param('org') org: string, @Body() dto: PackItemDto, @UploadedFile() file: Express.Multer.File | undefined, @Headers('x-contractor-portal') token?: string) {
    return this.portal.upload(org.slice(0, 100), token, dto, file ? { name: file.originalname, data: file.buffer } : null);
  }

  @Get(':org/bills')
  @Throttle(PUBLIC_API_THROTTLE)
  bills(@Param('org') org: string, @Headers('x-contractor-portal') token?: string) {
    return this.portal.bills(org.slice(0, 100), token);
  }

  @Get(':org/min-wage')
  @Throttle(PUBLIC_API_THROTTLE)
  minWage(@Param('org') org: string, @Query() q: MinWageQueryDto, @Headers('x-contractor-portal') token?: string) {
    return this.portal.minWage(org.slice(0, 100), token, q.locationId, q.skill);
  }
}
