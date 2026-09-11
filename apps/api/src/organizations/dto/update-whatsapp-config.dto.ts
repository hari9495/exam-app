import { IsBoolean, IsIn, IsObject, IsOptional, IsString } from 'class-validator';
import { WHATSAPP_PROVIDER_IDS } from '../../whatsapp/providers';

export class UpdateWhatsappConfigDto {
  @IsOptional()
  @IsBoolean()
  whatsappEnabled?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(WHATSAPP_PROVIDER_IDS)
  whatsappProvider?: string;

  // Provider-shaped, so left as an open object -- OrganizationsService.putWhatsappConfig
  // is the only place that interprets these keys, per adapter.configFields.
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
