import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsISO8601, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';

// HLP-12 accident case inputs. Whitelisted by the global ValidationPipe (unknown fields are refused).

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const Text = (min: number, max: number) => (target: object, key: string) => {
  trim()(target, key);
  IsString()(target, key);
  MinLength(min)(target, key);
  MaxLength(max)(target, key);
};
const Opt = (max: number) => (target: object, key: string) => {
  IsOptional()(target, key);
  Text(0, max)(target, key);
};
const Day = () => (target: object, key: string) => IsDateString({ strict: true })(target, key);

export class ReportAccidentDto {
  @IsIn(['employee', 'contract'])
  injuredKind!: 'employee' | 'contract';

  /** An employee: their record (the name comes from it). */
  @ValidateIf((o: ReportAccidentDto) => o.injuredKind === 'employee')
  @IsUUID()
  injuredEmployeeId?: string;

  /** A contract worker: their name and the contractor (the immediate employer). */
  @ValidateIf((o: ReportAccidentDto) => o.injuredKind === 'contract')
  @Text(1, 150)
  injuredName?: string;

  @ValidateIf((o: ReportAccidentDto) => o.injuredKind === 'contract')
  @Text(1, 150)
  contractor?: string;

  /** When it happened (date and time, with its offset). */
  @IsISO8601({ strict: true })
  occurredAt!: string;

  @IsUUID()
  locationId!: string;

  @Text(1, 200)
  place!: string;

  @Text(10, 5_000)
  description!: string;

  @Text(1, 80)
  injuryType!: string;

  @Opt(100)
  bodyPart?: string;

  @IsOptional()
  @IsBoolean()
  firstAid?: boolean;

  @Opt(300)
  witnesses?: string;
}

/** Case facts the safety team or the handler records; each is a new step (later entries win). */
export class FactsDto {
  @IsOptional()
  @IsBoolean()
  esiCovered?: boolean;

  /** ESIC insurance number: 10 or 17 digits. */
  @IsOptional()
  @Matches(/^(\d{10}|\d{17})$/, { message: 'The ESIC IP number has 10 or 17 digits.' })
  ipNumber?: string;

  /** The HR person who files the reports and handles the case (only the safety team names them). */
  @IsOptional()
  @IsUUID()
  handlerUserId?: string;

  @Opt(150)
  hospital?: string;

  @IsOptional()
  @Day()
  leaveFrom?: string;

  @IsOptional()
  @Day()
  leaveTo?: string;
}

export class StatementDto {
  @Text(1, 150)
  who!: string;

  @Text(10, 5_000)
  text!: string;
}

export class FiledDto {
  @Day()
  on!: string;

  @Opt(60)
  ack?: string;
}

export class EcDto {
  @IsIn(['death', 'permanent-total', 'permanent-partial', 'temporary'])
  kind!: 'death' | 'permanent-total' | 'permanent-partial' | 'temporary';

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(10_000_000)
  monthlyWage!: number;

  /** Schedule IV factor for the person's age, read from the Act (death and permanent disablement). */
  @ValidateIf((o: EcDto) => o.kind !== 'temporary')
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(500)
  factor?: number;

  @ValidateIf((o: EcDto) => o.kind === 'permanent-partial')
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(100)
  disablementPct?: number;

  @ValidateIf((o: EcDto) => o.kind === 'temporary')
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(1)
  @Max(3650)
  days?: number;

  /** The day compensation fell due (for example the medical board's date). */
  @Day()
  fellDueOn!: string;
}

export class EcPaidDto {
  @Day()
  on!: string;

  @IsIn(['payroll', 'deposit'])
  how!: 'payroll' | 'deposit';
}

export class MedicalDto {
  @IsIn(['diagnosis', 'certificate', 'disablement', 'note'])
  kind!: 'diagnosis' | 'certificate' | 'disablement' | 'note';

  @Text(1, 2_000)
  note!: string;
}

/** Founder answer 46: the injured-person search. */
export class PeopleQueryDto {
  @Text(2, 80)
  q!: string;
}
