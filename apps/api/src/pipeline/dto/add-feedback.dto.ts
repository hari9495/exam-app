import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class AddFeedbackDto {
  @IsOptional() @IsString() @MaxLength(5000) note?: string;
  @IsOptional() @IsInt() @Min(1) @Max(5) rating?: number;
}
