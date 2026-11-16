import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { ACCOMMODATION_KINDS, EXTRA_TIME_PERCENTS } from '@exam-platform/shared';

export class EvidenceDto {
  @IsString()
  @MaxLength(255)
  fileName!: string;

  // base64 data URI; the server checks the real size (10 MB) and the type by its first bytes after decoding.
  @IsString()
  @MaxLength(14_500_000)
  dataUri!: string;
}

/** AS-4b (answer 2011, PRC-23): what the candidate asks for before the test. */
export class AccommodationDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Choose what you need.' })
  @ArrayMaxSize(7)
  @IsIn(ACCOMMODATION_KINDS, { each: true, message: 'Choose from the list.' })
  kinds!: string[];

  @IsOptional()
  @IsIn(EXTRA_TIME_PERCENTS, { message: 'Choose 25 %, 50 % or 100 % extra time.' })
  extraTimePercent?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => EvidenceDto)
  evidence?: EvidenceDto | null;
}
