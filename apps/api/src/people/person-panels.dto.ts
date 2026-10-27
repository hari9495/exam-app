import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ID_TYPES } from './identity-checks.service';

// Bodies for the person record's panels (PPL-34 identity checks).

export class AttestDto {
  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}

export class ReverifyDto {
  @IsIn(ID_TYPES)
  typeKey!: string;
}
