import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateStatusDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsInt() @Min(0) position?: number;
}
