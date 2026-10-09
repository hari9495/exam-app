import { Transform, Type } from 'class-transformer';
import { ConfirmationDto } from './dto';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsDefined, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const DATE = { strict: true } as const;
const MONEY = /^\d{1,12}(\.\d{1,2})?$/;
const STATE = /^IN-[A-Z]{2}$/;

// ------------------------------------------------------------------------------------------ entity set-up (PAY-2.04)

export class RegistrationDto {
  @IsIn(['IN.PF', 'IN.ESI', 'IN.PT', 'IN.LWF', 'IN.TDS'])
  statute!: string;

  @IsOptional()
  @Matches(STATE)
  state?: string;

  @IsIn(['on', 'applied_awaited', 'off'])
  status!: 'on' | 'applied_awaited' | 'off';

  @IsOptional()
  @trim()
  @Matches(/^[A-Za-z0-9/ -]{4,40}$/, { message: 'Registration numbers are 4 to 40 letters, digits, / or -.' })
  registrationNo?: string;

  @IsOptional()
  @IsDateString(DATE)
  startOn?: string;

  @IsOptional()
  @IsDateString(DATE)
  appliedOn?: string;

  @IsOptional()
  @trim()
  @IsString()
  @Length(2, 200)
  responsiblePerson?: string;

  @IsOptional()
  @trim()
  @IsString()
  @Length(2, 100)
  responsibleDesignation?: string;

  @IsOptional()
  @IsObject()
  address?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  version?: number;
}

export class RegistrationsDto {
  @IsArray()
  @ArrayMaxSize(80)
  @ValidateNested({ each: true })
  @Type(() => RegistrationDto)
  registrations!: RegistrationDto[];
}

export class LegalOptionDto {
  @IsIn(['pf.on_actual_wage', 'bonus.rate', 'bonus.payment', 'gratuity.provisioning'])
  optionKey!: string;

  @trim()
  @IsString()
  @Length(1, 40)
  value!: string;

  @IsDateString(DATE)
  validFrom!: string;
}

// ------------------------------------------------------------------------------------------ pay groups (PAY-2.05)

export class PayGroupDto {
  @IsUUID()
  legalEntityId!: string;

  @trim()
  @IsString()
  @Length(2, 100)
  name!: string;

  @IsOptional()
  @IsIn(['calendar', '30', '26'])
  dayBasis?: string;

  @IsInt()
  @Min(1)
  @Max(28)
  cutOffDay!: number;

  @IsInt()
  @Min(0)
  @Max(28)
  payDay!: number;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(30)
  bankFormat?: string;

  @IsOptional()
  @IsInt()
  version?: number;
}

export class MemberDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @IsUUID('all', { each: true })
  employeeIds!: string[];

  @IsDateString(DATE)
  from!: string;
}

export class YearDto5b {
  @Matches(/^\d{4}$/)
  year!: string;
}

// ------------------------------------------------------------------------------------------ components and templates

export class ComponentDto {
  @Matches(/^[a-z][a-z0-9_]{0,29}$/, { message: 'A code is lower-case letters, digits and _ (up to 30), starting with a letter.' })
  code!: string;

  @trim()
  @IsString()
  @Length(2, 80)
  name!: string;

  @IsIn(['earning', 'deduction', 'employer', 'reimbursement', 'info'])
  kind!: string;

  @IsOptional() @IsBoolean() taxable?: boolean;
  @IsOptional() @IsBoolean() pfWage?: boolean;
  @IsOptional() @IsBoolean() esiWage?: boolean;
  @IsOptional() @IsBoolean() ptWage?: boolean;
  @IsOptional() @IsBoolean() gratuityWage?: boolean;
  @IsOptional() @IsBoolean() bonusWage?: boolean;
  @IsOptional() @IsBoolean() codeWagePart?: boolean;
  @IsOptional() @IsBoolean() codeExclusion?: boolean;
  @IsOptional() @IsBoolean() prorated?: boolean;
  @IsOptional() @IsBoolean() onPayslip?: boolean;
  @IsOptional() @IsBoolean() inCtc?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  prorationText?: string;

  @IsOptional()
  @IsIn(['none', 'rupee', 'up_rupee'])
  rounding?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(60)
  ledger?: string;

  @IsOptional()
  @IsIn(['active', 'retired'])
  status?: string;

  @IsOptional()
  @IsInt()
  version?: number;
}

export class FormulaCheckDto {
  @IsString()
  @MaxLength(500)
  text!: string;

  /** Component codes the formula may read (a template's lines). */
  @IsArray()
  @ArrayMaxSize(80)
  @IsString({ each: true })
  codes!: string[];
}

export class TemplateDto {
  @trim()
  @IsString()
  @Length(2, 100)
  name!: string;

  @IsOptional()
  @IsUUID()
  legalEntityId?: string;
}

export class TemplateLineDto {
  @Matches(/^[a-z][a-z0-9_]{0,29}$/)
  code!: string;

  @IsString()
  @MaxLength(500)
  formula!: string;
}

/** The sample run a version must pass before it is saved (§7.3). */
export class SampleDto {
  @Matches(MONEY)
  annualCtc!: string;

  @Matches(STATE)
  state!: string;

  @IsInt()
  @Min(15)
  @Max(80)
  age!: number;
}

export class TemplateVersionDto {
  @IsDateString(DATE)
  validFrom!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => TemplateLineDto)
  lines!: TemplateLineDto[];

  @Matches(/^[a-z][a-z0-9_]{0,29}$/)
  balancing!: string;

  @IsBoolean()
  employerPfInCtc!: boolean;

  @IsBoolean()
  employerEsiInCtc!: boolean;

  @IsBoolean()
  gratuityInCtc!: boolean;

  @IsDefined()
  @ValidateNested()
  @Type(() => SampleDto)
  sample!: SampleDto;
}

// ------------------------------------------------------------------------------------------ compensation (PAY-2.09)

export class CompensationInputDto {
  @IsUUID()
  employeeId!: string;

  @IsDateString(DATE)
  effectiveDate!: string;

  @IsUUID()
  templateVersionId!: string;

  @IsIn(['ctc', 'fixed'])
  entryMode!: 'ctc' | 'fixed';

  @IsOptional()
  @Matches(MONEY)
  annualCtc?: string;

  /** Fixed entry: monthly amount per plain earning code. */
  @IsOptional()
  @IsObject()
  fixed?: Record<string, string>;

  @IsOptional()
  @IsIn(['monthly', 'hourly', 'daily'])
  payBasis?: 'monthly' | 'hourly' | 'daily';

  @IsOptional()
  @Matches(MONEY)
  rate?: string;

  @IsOptional()
  @Matches(/^\d{1,2}(\.\d{1,2})?$/)
  otMultiplier?: string;

  @IsOptional()
  @Matches(/^\d{1,2}(\.\d{1,2})?$/)
  holidayMultiplier?: string;
}

export class CompensationChangeDto extends CompensationInputDto {
  @trim()
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;

  /** YX-HIS-12: required for a date before the company's retro limit. */
  @IsOptional()
  @trim()
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  overrideReason?: string;
}

export class LetterDto {
  @trim()
  @IsString()
  @Length(2, 120)
  signatory!: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => ConfirmationDto)
  confirmation!: ConfirmationDto;
}

export class AsOnDto {
  @IsOptional()
  @IsDateString(DATE)
  asOn?: string;
}

export class StatutoryProfileDto {
  @IsDateString(DATE)
  validFrom!: string;

  @IsIn(['yes', 'no'])
  pf!: 'yes' | 'no';

  @IsOptional() @IsBoolean() eps?: boolean;
  @IsOptional() @IsBoolean() pre2014Member?: boolean;
  @IsOptional() @IsBoolean() higherPension?: boolean;

  @IsOptional()
  @Matches(/^\d{1,2}(\.\d{1,2})?$/)
  vpfPercent?: string;

  @IsOptional() @IsBoolean() pfOnActualWage?: boolean;
  @IsOptional() @IsBoolean() internationalWorker?: boolean;

  @IsIn(['yes', 'no', 'by_wage'])
  esi!: 'yes' | 'no' | 'by_wage';

  @IsOptional() @IsBoolean() pwdCeilingConsent?: boolean;

  @IsOptional()
  @Matches(STATE)
  ptState?: string;

  @IsOptional()
  @Matches(STATE)
  lwfState?: string;

  @trim()
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;
}

// ------------------------------------------------------------------------------------------ imports (PAY-2.12)

export class ImportDto {
  @IsUUID()
  legalEntityId!: string;

  @IsIn(['opening_balances', 'as_paid_lines', 'form12b'])
  kind!: 'opening_balances' | 'as_paid_lines' | 'form12b';

  /** Rows as the template sheet gives them (employeeCode first); at most 5,000 per batch. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  @IsObject({ each: true })
  rows!: Record<string, string>[];
}

export class GoLiveDto {
  @IsUUID()
  legalEntityId!: string;

  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  goLiveMonth!: string;
}

// ------------------------------------------------------------------------------------------ payslip layout (PAY-2.13)

export class LayoutBlockDto {
  @Matches(/^[a-z][A-Za-z_]{1,30}$/)
  key!: string;

  @IsBoolean()
  shown!: boolean;
}

export class LayoutDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => LayoutBlockDto)
  blocks!: LayoutBlockDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @IsIn(['en', 'hi', 'ta', 'te', 'kn'], { each: true })
  languages!: string[];
}

// ------------------------------------------------------------------------------------------ console (PAY-2.01)

export class RuleDraftDto {
  @Matches(/^IN\.[A-Z-]{2,15}$/)
  statute!: string;

  @Matches(/^IN(-[A-Z]{2})?$/)
  jurisdiction!: string;

  @Matches(/^[A-Za-z0-9.-]{2,20}$/)
  version!: string;

  @IsDateString(DATE)
  validFrom!: string;

  @IsOptional()
  @IsDateString(DATE)
  validTo?: string;

  @IsObject()
  values!: Record<string, unknown> & { kind: string };

  @trim()
  @IsString()
  @Length(20, 500)
  source!: string;

  @IsIn(['OLD-ACT', 'CODE', 'IT-1961', 'IT-2025'])
  lawVersion!: string;

  @IsBoolean()
  verify!: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsObject({ each: true })
  golden!: { name: string; fn: string; input: Record<string, unknown>; expected: Record<string, unknown> }[];
}
