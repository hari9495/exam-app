import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';

class SlotDto {
  @IsDateString() startsAt!: string;
  @IsDateString() endsAt!: string;
}

export class CreateInterviewDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => SlotDto)
  slots!: SlotDto[];

  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  panelistUserIds!: string[];

  @IsString() location!: string;
  @IsString() timeZone!: string;

  @IsOptional() @IsString() recruiterNote?: string;
}
