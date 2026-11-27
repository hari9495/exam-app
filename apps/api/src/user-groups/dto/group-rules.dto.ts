import { ArrayMaxSize, IsArray, IsOptional, IsUUID } from 'class-validator';

/** T2-G 42 (answer 2745): the rules a group's members are worked out from; each a list (any of them), all must match. */
export class GroupRulesDto {
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsUUID('all', { each: true }) legalEntityIds?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsUUID('all', { each: true }) locationIds?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsUUID('all', { each: true }) departmentIds?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsUUID('all', { each: true }) gradeIds?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsUUID('all', { each: true }) employmentTypeIds?: string[];
  /** T2-G 2903: the person's tags. */
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsUUID('all', { each: true }) tagIds?: string[];
}
