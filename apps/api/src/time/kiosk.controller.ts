import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SkipGlobalThrottle } from '../fail-open-throttler.guard';
import { PUBLIC_API_THROTTLE, STRICT_WALK_IN_THROTTLE } from '../rate-limit-tiers';
import { DevicePunchDto, KioskCodeDto, KioskIdentifyDto, KioskLeaveDto, KioskPersonDto, KioskPunchDto, KioskSetupDto, KioskSyncDto } from './devices.dto';
import { CurrentKiosk, KioskGuard, KioskThrottlerGuard } from './kiosk.guard';
import { KioskService, type Kiosk } from './kiosk.service';

// TIM-13 Kiosk: a shared tablet, no user sign-in. Set-up takes HR's one-time code (limited per address); every other
// route needs the kiosk's own secret in the x-kiosk-token header (KioskGuard, 401 otherwise) and is limited per kiosk.
// A person's actions need the two-minute pass from identify (x-kiosk-person on reads, `person` on punches).
@Controller('kiosk')
@SkipGlobalThrottle()
@UseGuards(KioskThrottlerGuard)
export class KioskController {
  constructor(private readonly kiosks: KioskService) {}

  @Post('setup')
  @HttpCode(200)
  @Throttle(STRICT_WALK_IN_THROTTLE)
  setup(@Body() dto: KioskSetupDto) {
    return this.kiosks.setup(dto.code);
  }

  @Get('me')
  @UseGuards(KioskGuard)
  me(@CurrentKiosk() k: Kiosk) {
    return this.kiosks.info(k);
  }

  @Post('identify')
  @HttpCode(200)
  @UseGuards(KioskGuard)
  @Throttle(PUBLIC_API_THROTTLE)
  identify(@CurrentKiosk() k: Kiosk, @Body() dto: KioskIdentifyDto) {
    return this.kiosks.identify(k, dto);
  }

  @Post('code')
  @HttpCode(200)
  @UseGuards(KioskGuard)
  @Throttle(PUBLIC_API_THROTTLE)
  code(@CurrentKiosk() k: Kiosk, @Body() dto: KioskCodeDto) {
    return this.kiosks.checkCode(k, dto.code);
  }

  @Get('person/leave')
  @UseGuards(KioskGuard)
  leave(@CurrentKiosk() k: Kiosk, @Headers('x-kiosk-person') person?: string) {
    return this.kiosks.leave(k, person);
  }

  @Post('person/leave')
  @UseGuards(KioskGuard)
  applyLeave(@CurrentKiosk() k: Kiosk, @Body() dto: KioskLeaveDto) {
    return this.kiosks.applyLeave(k, dto);
  }

  @Get('person/training')
  @UseGuards(KioskGuard)
  training(@CurrentKiosk() k: Kiosk, @Headers('x-kiosk-person') person?: string) {
    return this.kiosks.training(k, person);
  }

  @Post('person/training/:id')
  @HttpCode(200)
  @UseGuards(KioskGuard)
  markTraining(@CurrentKiosk() k: Kiosk, @Param('id', ParseUUIDPipe) id: string, @Body() dto: KioskPersonDto) {
    return this.kiosks.markTraining(k, dto.person, id);
  }

  @Get('person/today')
  @UseGuards(KioskGuard)
  today(@CurrentKiosk() k: Kiosk, @Headers('x-kiosk-person') person?: string) {
    return this.kiosks.today(k, person);
  }

  @Post('punch')
  @HttpCode(200)
  @UseGuards(KioskGuard)
  punch(@CurrentKiosk() k: Kiosk, @Body() dto: KioskPunchDto) {
    const { person, ...item } = dto;
    return this.kiosks.punch(k, person, item as DevicePunchDto);
  }

  @Post('sync')
  @HttpCode(200)
  @UseGuards(KioskGuard)
  @Throttle(PUBLIC_API_THROTTLE)
  sync(@CurrentKiosk() k: Kiosk, @Body() dto: KioskSyncDto) {
    return this.kiosks.sync(k, dto.items);
  }
}
