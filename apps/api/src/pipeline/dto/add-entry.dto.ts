import { Type } from 'class-transformer';
import { IsEmail, IsObject, IsOptional, IsString, MaxLength, MinLength, ValidateNested, IsUUID } from 'class-validator';

class NewCandidateDto {
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsEmail() email!: string;
  @IsOptional() @IsString() @MaxLength(50) phone?: string;
}

export class AddEntryDto {
  @IsOptional() @IsUUID() candidateId?: string;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => NewCandidateDto) newCandidate?: NewCandidateDto;
}
