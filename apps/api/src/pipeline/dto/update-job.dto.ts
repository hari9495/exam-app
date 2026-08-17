import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateJobDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200)
  title?: string;

  @IsOptional() @IsString() @MaxLength(5000)
  description?: string;

  @IsOptional() @IsIn(['open', 'closed'])
  status?: 'open' | 'closed';
}
