import { ValidateNested, IsOptional, IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { GroupRulesDto } from './group-rules.dto';

export class UpdateUserGroupDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  /** T2-G 42: members worked out from these rules (daily and on save) instead of picked by hand. */
  @IsOptional() @ValidateNested() @Type(() => GroupRulesDto) rules?: GroupRulesDto;
}
