import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { LeadsService } from './leads.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { STRICT_AUTH_THROTTLE } from '../rate-limit-tiers';

@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post()
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  async create(@Body() dto: CreateLeadDto): Promise<{ success: true }> {
    await this.leadsService.create(dto);
    return { success: true };
  }
}
