import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsOptional, IsUUID, Matches, ValidateNested } from 'class-validator';

const MONEY = /^\d{1,12}(\.\d{1,2})?$/;

export class OfferBatchRowDto {
  @IsUUID() entryId!: string;
  @Matches(MONEY, { message: 'Give each fixed CTC in rupees.' }) annualCtc!: string;
}

/** HIR-28: one job, one letter, one salary structure, one joining day; a fixed CTC per candidate (at most 100). */
export class OfferBatchDto {
  @IsUUID() jobId!: string;
  /** Made by the screen once per batch: the same key never sends a second set of offers. */
  @IsUUID() batchKey!: string;
  @IsUUID() templateVersionId!: string;
  @IsUUID() locationId!: string;
  @IsDateString({ strict: true }) startDate!: string;
  @IsOptional() @IsIn(['offer', 'loi']) letterKind?: 'offer' | 'loi';
  @IsOptional() @IsUUID() templateId?: string;
  @IsOptional() @IsBoolean() addConditions?: boolean;
  @IsArray() @ArrayMinSize(1, { message: 'Choose at least one candidate.' }) @ArrayMaxSize(100, { message: 'A batch has at most 100 candidates.' }) @ValidateNested({ each: true }) @Type(() => OfferBatchRowDto)
  rows!: OfferBatchRowDto[];
}
