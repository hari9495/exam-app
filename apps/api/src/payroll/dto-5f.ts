import { Transform, Type } from 'class-transformer';
import { IsDefined, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { ConfirmationDto } from './dto';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MONEY = /^\d{1,12}(\.\d{1,2})?$/;
const TAX_YEAR = /^\d{4}-\d{2}$/;

export class HubDto {
  @IsUUID()
  entityId!: string;

  @Matches(MONTH)
  month!: string;
}

export class EntityDto {
  @IsUUID()
  entityId!: string;

  @IsOptional()
  @Matches(MONTH)
  month?: string;
}

export class FilingDto {
  @IsUUID()
  legalEntityId!: string;

  @IsIn(['IN.PF', 'IN.ESI', 'IN.PT', 'IN.LWF'])
  statute!: 'IN.PF' | 'IN.ESI' | 'IN.PT' | 'IN.LWF';

  /** PT and LWF: the state (e.g. IN-KA). */
  @IsOptional()
  @Matches(/^IN-[A-Z]{2}$/)
  state?: string;

  @Matches(MONTH)
  month!: string;

  @IsOptional()
  @IsIn(['original', 'supplementary', 'excess_adjustment', 'excess_refund'])
  kind: 'original' | 'supplementary' | 'excess_adjustment' | 'excess_refund' = 'original';

  /** A new file for the month, a supplementary filing or an excess. */
  @IsOptional()
  @trim()
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @Matches(MONEY)
  amount?: string;
}

export class UploadedDto {
  @trim()
  @Matches(/^[A-Za-z0-9/-]{4,60}$/, { message: 'The portal reference (TRRN or challan number) is letters, digits, / and -.' })
  reference!: string;
}

export class ConfirmDto5f {
  @IsDefined()
  @ValidateNested()
  @Type(() => ConfirmationDto)
  confirmation!: ConfirmationDto;
}

export class ChallanPrepareDto {
  @IsUUID()
  entityId!: string;

  @Matches(MONTH)
  month!: string;
}

export class ChallanUpdateDto {
  @IsOptional()
  @Matches(MONEY)
  tds?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @Matches(/^\d{5}$/, { message: 'A challan serial number is 5 digits.' })
  challanNo?: string;

  @IsOptional()
  @Matches(/^\d{7}$/, { message: 'A BSR code is 7 digits.' })
  bsrCode?: string;

  @IsOptional()
  @Matches(DATE)
  depositDate?: string;
}

export class ReturnDto {
  @IsUUID()
  entityId!: string;

  @Matches(TAX_YEAR)
  taxYear!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4)
  quarter!: number;
}

export class ReturnFiledDto extends ConfirmDto5f {
  @trim()
  @Matches(/^[A-Za-z0-9]{6,30}$/, { message: 'The token number is letters and digits.' })
  tokenNo!: string;
}

export class PartADto {
  @IsUUID()
  entityId!: string;

  @Matches(TAX_YEAR)
  taxYear!: string;
}

export class CertificateBatchDto extends ConfirmDto5f {
  @IsUUID()
  entityId!: string;

  @Matches(TAX_YEAR)
  taxYear!: string;
}

export class RegisterDto {
  @IsUUID()
  entityId!: string;

  @Matches(MONTH)
  month!: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  /** A new version of registers already made for the month needs a reason. */
  @IsOptional()
  @trim()
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason?: string;
}

export class AdvisoryReviewDto {
  @IsUUID()
  entityId!: string;

  @trim()
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  note!: string;
}
