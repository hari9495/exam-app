import { ArrayNotEmpty, IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { INTEGRATION_EVENT_TYPES } from '@exam-platform/shared';

export class UpdateConnectedAppDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) label?: string;
  @IsOptional() @IsArray() @ArrayNotEmpty() @IsIn(INTEGRATION_EVENT_TYPES as unknown as string[], { each: true }) events?: string[];
  @IsOptional() @IsIn(['active', 'disabled']) status?: 'active' | 'disabled';
  @IsOptional() @IsString() @MinLength(1) targetUrl?: string;
}
