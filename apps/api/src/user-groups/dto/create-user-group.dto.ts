import { IsArray, IsOptional, IsString, IsNotEmpty, IsUUID, MaxLength, ArrayMaxSize } from 'class-validator';

export class CreateUserGroupDto {
  @IsString() @IsNotEmpty() @MaxLength(200) name!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(500) @IsUUID(undefined, { each: true }) memberUserIds?: string[];
}
