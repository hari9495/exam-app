import { ValidateNested, IsArray, IsOptional, IsString, IsNotEmpty, IsUUID, MaxLength, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import { GroupRulesDto } from './group-rules.dto';

export class CreateUserGroupDto {
  @IsString() @IsNotEmpty() @MaxLength(200) name!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(500) @IsUUID(undefined, { each: true }) memberUserIds?: string[];
  /** T2-G 42: members worked out from these rules (daily and on save) instead of picked by hand. */
  @IsOptional() @ValidateNested() @Type(() => GroupRulesDto) rules?: GroupRulesDto;
}
