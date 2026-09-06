import { IsOptional, IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class UpdateUserGroupDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
}
