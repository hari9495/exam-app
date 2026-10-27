import { IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export const CF_ENTITY_TYPES = ['candidate', 'job'] as const;
/** Every entity a definition may describe; the hiring settings route takes only CF_ENTITY_TYPES. */
export const CF_ALL_ENTITY_TYPES = ['candidate', 'job', 'employee'] as const;
export type CustomFieldEntityType = (typeof CF_ALL_ENTITY_TYPES)[number];
/** Employee fields' data class (P02 §4.4): who reads and edits the values. */
export const CF_DATA_CLASSES = ['public', 'internal', 'personal', 'confidential'] as const;
export type CustomFieldDataClass = (typeof CF_DATA_CLASSES)[number];
export const CF_FIELD_TYPES = ['text', 'number', 'date', 'select'] as const;

export class CreateCustomFieldDto {
  @IsIn(CF_ALL_ENTITY_TYPES) entityType!: CustomFieldEntityType;
  @IsString() @IsNotEmpty() @MaxLength(200) label!: string;
  @IsIn(CF_FIELD_TYPES) fieldType!: 'text' | 'number' | 'date' | 'select';
  @IsOptional() @IsArray() @IsString({ each: true }) @MaxLength(200, { each: true }) options?: string[];
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsIn(CF_DATA_CLASSES) dataClass?: CustomFieldDataClass;
  @IsOptional() @IsBoolean() showOnApply?: boolean;
  @IsOptional() @IsInt() @Min(0) position?: number;
}
