// entityType/key/fieldType intentionally absent — immutable after creation.
import { IsArray, IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateCustomFieldDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) label?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) @MaxLength(200, { each: true }) options?: string[];
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsBoolean() showOnApply?: boolean;
  @IsOptional() @IsInt() @Min(0) position?: number;
}
