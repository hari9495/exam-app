import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { HRIS_PROVIDER_IDS } from '../../hris/providers';

export class UpdateHrisConfigDto {
  @IsBoolean()
  enabled!: boolean;

  // Which connector: 'generic' (a structured employee-record POST to a URL) or a vendor preset
  // (greenhouse | lever | bamboohr | workday). The connector validates its own required fields.
  @IsOptional()
  @IsIn(HRIS_PROVIDER_IDS)
  provider?: string;

  // generic / workday: the endpoint URL. Empty string clears; omitted leaves unchanged.
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  targetUrl?: string;

  // generic: the full Authorization header value ("Bearer xxx" / "Basic yyy"). Empty clears; omitted unchanged.
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  authHeader?: string;

  // Vendor API key / token (greenhouse, lever, bamboohr, workday). Omitted keeps the existing value.
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  apiKey?: string;

  // BambooHR company subdomain.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  subdomain?: string;

  // Greenhouse On-Behalf-Of user id.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  onBehalfOf?: string;

  // Lever perform_as user id.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  performAs?: string;
}
