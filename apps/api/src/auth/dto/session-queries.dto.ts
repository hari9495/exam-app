import { IsIn, IsISO8601, IsNumberString, IsOptional, IsUUID } from 'class-validator';

class PageQueryDto {
  @IsOptional()
  @IsNumberString({ no_symbols: true })
  page?: string;

  @IsOptional()
  @IsNumberString({ no_symbols: true })
  pageSize?: string;
}

export class SessionsQueryDto extends PageQueryDto {
  @IsOptional()
  @IsUUID()
  userId?: string;
}

export class MyLoginHistoryQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(['success', 'failed', 'locked', 'mfa_failed'])
  result?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;
}

export class LoginEventsQueryDto extends MyLoginHistoryQueryDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsIn(['password', 'saml'])
  method?: string;
}
