// entityType/key/fieldType intentionally absent — immutable after creation.
import { CF_DATA_CLASSES, type CustomFieldDataClass } from './create-custom-field.dto';
import { IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateCustomFieldDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) label?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) @MaxLength(200, { each: true }) options?: string[];
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsIn(CF_DATA_CLASSES) dataClass?: CustomFieldDataClass;
  @IsOptional() @IsBoolean() showOnApply?: boolean;
  @IsOptional() @IsInt() @Min(0) position?: number;
}
