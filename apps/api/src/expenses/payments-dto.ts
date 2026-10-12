import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateNested } from 'class-validator';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export class ClaimIdsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  claimIds!: string[];
}

export class PayoutDto extends ClaimIdsDto {
  @Matches(/^\d{6,20}$/, { message: 'The account the money comes from is 6 to 20 digits.' })
  debitAccount!: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  payDate?: string;
}

export class ReleaseDto {
  @trim()
  @IsString()
  @MaxLength(40)
  phrase!: string;
}

export class CancelBatchDto {
  @trim()
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  reason!: string;
}

export class PayoutResultRowDto {
  @IsUUID()
  claimId!: string;

  @IsIn(['paid', 'failed', 'returned'])
  status!: 'paid' | 'failed' | 'returned';

  @IsOptional()
  @Matches(/^[A-Za-z0-9/-]{1,60}$/, { message: 'A bank reference is letters, digits, / and -.' })
  ref?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason?: string;
}

export class PayoutResultsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => PayoutResultRowDto)
  rows!: PayoutResultRowDto[];
}

export class JournalQueryDto {
  @IsUUID()
  entityId!: string;

  @Matches(MONTH)
  month!: string;
}
