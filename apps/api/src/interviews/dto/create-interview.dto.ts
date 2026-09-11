import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsIn, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';

class SlotDto {
  @IsDateString() startsAt!: string;
  @IsDateString() endsAt!: string;
}

export class CreateInterviewDto {
  // Required in 'proposed' mode (the default), forbidden in 'self_book' mode -- enforced in
  // the service, not here, since that's a cross-field rule @IsOptional can't express.
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => SlotDto)
  slots?: SlotDto[];

  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  panelistUserIds!: string[];

  @IsString() location!: string;
  @IsString() timeZone!: string;

  @IsOptional() @IsString() recruiterNote?: string;

  @IsOptional() @IsIn(['proposed', 'self_book']) bookingMode?: 'proposed' | 'self_book';
  @IsOptional() @IsDateString() bookingWindowStart?: string;
  @IsOptional() @IsDateString() bookingWindowEnd?: string;
  @IsOptional() @IsIn([15, 30, 45, 60]) slotDurationMinutes?: number;
}
