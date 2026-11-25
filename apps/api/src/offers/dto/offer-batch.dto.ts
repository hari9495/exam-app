import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsOptional, IsUUID, Matches, ValidateNested } from 'class-validator';

/** Answer 514: above ₹0 (blank and 0 are refused). */
const POSITIVE_MONEY = /^(?!0+(\.0+)?$)\d{1,12}(\.\d{1,2})?$/;

export class OfferBatchRowDto {
  @IsUUID() entryId!: string;
  @Matches(POSITIVE_MONEY, { message: 'Enter a fixed CTC above ₹0 for each candidate.' }) annualCtc!: string;
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
  /** Answer 401: the People joiner batch the accepted offers join (an open one, same legal entity and joining day). */
  @IsOptional() @IsUUID() joinerBatchId?: string;
  @IsArray() @ArrayMinSize(1, { message: 'Choose at least one candidate.' }) @ArrayMaxSize(100, { message: 'A batch has at most 100 candidates.' }) @ValidateNested({ each: true }) @Type(() => OfferBatchRowDto)
  rows!: OfferBatchRowDto[];
}
