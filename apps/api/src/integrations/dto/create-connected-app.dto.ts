import { ArrayNotEmpty, IsArray, IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { INTEGRATION_EVENT_TYPES } from '@exam-platform/shared';

export class CreateConnectedAppDto {
  @IsIn(['slack', 'msteams']) type!: 'slack' | 'msteams';
  @IsString() @MinLength(1) @MaxLength(120) label!: string;
  @IsString() @MinLength(1) targetUrl!: string;
  @IsArray() @ArrayNotEmpty() @IsIn(INTEGRATION_EVENT_TYPES as unknown as string[], { each: true }) events!: string[];
}
