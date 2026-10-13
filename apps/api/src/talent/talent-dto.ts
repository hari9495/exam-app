import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateIf } from 'class-validator';

// Recruitment batch AT4 request bodies (M10-BUILD-DESIGN §18.1).
const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class MergeDto {
  /** The candidate merged away into the one in the URL. */
  @IsUUID()
  mergedId!: string;

  @IsOptional()
  @IsIn(['kept', 'merged'])
  name?: 'kept' | 'merged';

  @IsOptional()
  @IsIn(['kept', 'merged'])
  phone?: 'kept' | 'merged';

  @IsOptional()
  @IsIn(['kept', 'merged'])
  resume?: 'kept' | 'merged';
}

export class PoolDto {
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsIn(['pool', 'hotlist'])
  kind!: 'pool' | 'hotlist';

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(500)
  description?: string | null;
}

export class PoolMembersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  candidateIds!: string[];

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

export class LegalHoldDto {
  @IsBoolean()
  on!: boolean;

  @ValidateIf((o: LegalHoldDto) => o.on)
  @trim()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason?: string;
}

export class WithdrawConsentDto {
  @IsIn(['application', 'talent_pool'])
  purpose!: 'application' | 'talent_pool';
}

export class RetentionRunDto {
  @IsBoolean()
  dryRun!: boolean;
}
