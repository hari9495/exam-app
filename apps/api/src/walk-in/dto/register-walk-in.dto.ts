import { Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';

/** AS-3 (PRC-29): a campus drive's own fields (asked only when the drive's group is a campus drive). */
export class WalkInCampusDto {
  @IsUUID()
  institutionId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  rollNumber!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  branch?: string;

  @IsOptional()
  @IsInt()
  @Min(2000)
  @Max(2100)
  graduationYear?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  cgpa?: number;
}

export class RegisterWalkInDto {
  @IsString()
  @IsNotEmpty()
  examId!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsBoolean()
  consentAccepted?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => WalkInCampusDto)
  campus?: WalkInCampusDto;
}
