import { Type } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';

export class ApiUsageQueryDto {
  // 30 or 90; default 30. @Type coerces the query string to a number before @IsIn checks it.
  @IsOptional()
  @Type(() => Number)
  @IsIn([30, 90])
  window?: number;
}
