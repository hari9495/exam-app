import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDefined, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { ConfirmationDto } from './dto';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const MONEY = /^\d{1,12}(\.\d{1,2})?$/;
const TAX_YEAR = /^\d{4}-\d{2}$/;

export class OtherIncomeDto {
  @IsIn(['interest', 'rent', 'other'])
  kind!: 'interest' | 'rent' | 'other';

  @Matches(MONEY)
  amount!: string;
}

export class WorkspacePatchDto {
  @IsOptional()
  @IsIn(['new', 'old'])
  regime?: 'new' | 'old';

  @IsOptional()
  @IsIn(['resident', 'non_resident'])
  residentialStatus?: 'resident' | 'non_resident';

  /** A tax residency certificate's last day (DTAA claims). */
  @IsOptional()
  @Matches(DATE)
  trcValidTo?: string | null;

  @IsOptional()
  @Matches(/^[A-Z]{2}$/)
  dtaaCountry?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => OtherIncomeDto)
  otherIncome?: OtherIncomeDto[];
}

export class DeclarationLineDto {
  @Matches(/^[a-z0-9_]{2,30}$/)
  subjectKey!: string;

  /** The year's amount; for rent (hra) the monthly rent. */
  @Matches(MONEY)
  amount!: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(200)
  landlordName?: string;

  @IsOptional()
  @trim()
  @Matches(/^[A-Z0-9]{10}$/)
  landlordPan?: string;

  @IsOptional()
  @Matches(MONTH)
  rentFrom?: string;

  @IsOptional()
  @Matches(MONTH)
  rentTo?: string;

  @IsOptional()
  @IsBoolean()
  metro?: boolean;
}

export class DeclarationsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => DeclarationLineDto)
  lines!: DeclarationLineDto[];
}

export class ProofDecisionDto {
  @IsIn(['approve', 'partly', 'reject'])
  decision!: 'approve' | 'partly' | 'reject';

  @IsOptional()
  @Matches(MONEY)
  amount?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  comment?: string;
}

export class ProofQueueDto {
  @IsOptional()
  @IsIn(['pending', 'approved', 'partly', 'rejected'])
  status?: string;
}

export class RegimeOverrideDto {
  @IsIn(['new', 'old'])
  regime!: 'new' | 'old';

  @trim()
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}

export class PanStatusDto {
  @IsIn(['operative', 'inoperative'])
  status!: 'operative' | 'inoperative';

  @trim()
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  reason!: string;
}

export class WorkspaceListDto {
  @IsOptional()
  @IsUUID()
  employeeId?: string;
}

export class PerquisiteDto {
  @IsUUID()
  employeeId!: string;

  @Matches(TAX_YEAR)
  taxYear!: string;

  @IsIn(['car', 'accommodation', 'loan', 'esop', 'other'])
  kind!: 'car' | 'accommodation' | 'loan' | 'esop' | 'other';

  @Matches(MONEY)
  annualValue!: string;

  @trim()
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  description!: string;
}

export class CertificateDto {
  @IsUUID()
  employeeId!: string;

  @Matches(TAX_YEAR)
  taxYear!: string;
}

export class IssueCertificateDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => ConfirmationDto)
  confirmation!: ConfirmationDto;
}
