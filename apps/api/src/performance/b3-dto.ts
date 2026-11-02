import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min, ValidateIf } from 'class-validator';

// Request bodies for PRF-13 (hand-over), PRF-14 (merge), PRF-15 (disputes), PRF-16 (coach) and PRF-17 (review assistant).

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class HandoverDecideDto {
  @IsIn(['realigned', 'unaligned'])
  decision!: 'realigned' | 'unaligned';

  @ValidateIf((o: HandoverDecideDto) => o.decision === 'realigned')
  @IsUUID()
  parentGoalId?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class RaiseDisputeDto {
  @trim()
  @IsString()
  @Length(20, 4000, { message: 'Say what you are escalating and why, in at least 20 characters.' })
  grounds!: string;

  @IsIn(['rereview', 'correct', 'other'])
  sought!: 'rereview' | 'correct' | 'other';
}

export class LegalHoldDto {
  @IsBoolean()
  on!: boolean;

  @IsInt()
  version!: number;
}

export class DisputeDecisionDto {
  @IsIn(['upheld', 'not_upheld', 'rereview'])
  decision!: 'upheld' | 'not_upheld' | 'rereview';

  @trim()
  @IsString()
  @Length(10, 2000, { message: 'Write the decision and its reasons, in at least 10 characters.' })
  note!: string;

  @IsInt()
  version!: number;
}

export class DisputeExportDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Choose at least one item to export.' })
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  items!: string[];

  @IsUUID()
  signatoryUserId!: string;
}

export class CoachOptOutDto {
  @IsBoolean()
  optedOut!: boolean;
}

export class CoachDismissDto {
  @IsString()
  @Length(3, 80)
  key!: string;
}

export class BiasCheckDto {
  @IsString()
  @MaxLength(10000)
  text!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  rating?: number | null;
}

export class BiasDecisionDto {
  @IsString()
  @Length(3, 120)
  flagId!: string;

  @IsString()
  @Length(3, 60)
  kind!: string;

  @IsIn(['accepted', 'ignored'])
  decision!: 'accepted' | 'ignored';
}
