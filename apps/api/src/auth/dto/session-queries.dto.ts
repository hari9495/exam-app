import { IsIn, IsISO8601, IsNumberString, IsOptional, IsUUID } from 'class-validator';
import { LOGIN_METHODS } from '../sessions.service';

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
  // 'unsuccessful' = every result except success (the "Failed" filter in Me › Security).
  @IsOptional()
  @IsIn(['success', 'failed', 'locked', 'mfa_failed', 'unsuccessful'])
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
  @IsIn(LOGIN_METHODS)
  method?: string;
}
