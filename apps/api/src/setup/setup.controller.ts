import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SetupService } from './setup.service';
import { CompleteSetupDto } from './dto/complete-setup.dto';
import { STRICT_AUTH_THROTTLE } from '../rate-limit-tiers';

@Controller('setup')
export class SetupController {
  constructor(private readonly setupService: SetupService) {}

  @Get('status')
  async status() {
    return { needsSetup: await this.setupService.needsSetup() };
  }

  @Post('complete')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  async complete(@Body() dto: CompleteSetupDto) {
    await this.setupService.completeSetup(dto);
    return { success: true };
  }
}
