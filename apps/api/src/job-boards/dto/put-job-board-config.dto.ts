import { IsIn, IsObject, IsOptional } from 'class-validator';
import { ALL_PROVIDER_IDS } from '../providers';

export class PutJobBoardConfigDto {
  @IsOptional()
  @IsIn(ALL_PROVIDER_IDS as unknown as string[])
  provider?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
