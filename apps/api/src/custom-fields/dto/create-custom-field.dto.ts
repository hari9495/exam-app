import { IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export const CF_ENTITY_TYPES = ['candidate', 'job'] as const;
export const CF_FIELD_TYPES = ['text', 'number', 'date', 'select'] as const;

export class CreateCustomFieldDto {
  @IsIn(CF_ENTITY_TYPES) entityType!: 'candidate' | 'job';
  @IsString() @IsNotEmpty() @MaxLength(200) label!: string;
  @IsIn(CF_FIELD_TYPES) fieldType!: 'text' | 'number' | 'date' | 'select';
  @IsOptional() @IsArray() @IsString({ each: true }) @MaxLength(200, { each: true }) options?: string[];
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsBoolean() showOnApply?: boolean;
  @IsOptional() @IsInt() @Min(0) position?: number;
}
