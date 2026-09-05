import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePortalProfileDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(50) phone?: string;
}
