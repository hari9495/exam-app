import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Min, ValidateIf, ValidateNested } from 'class-validator';

// Batch 5g request bodies (off-cycle runs, arrears, proposals, F&F, overpayments). Amounts are positive rupees.
const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const POSITIVE = /^(?!0+(\.0+)?$)\d{1,12}(\.\d{1,2})?$/;
const MONEY = /^\d{1,12}(\.\d{1,2})?$/;
const CODE = /^[a-z][a-z0-9_]{0,29}$/;

export class OffcycleItemDto {
  @IsUUID()
  employeeId!: string;

  @Matches(CODE)
  componentCode!: string;

  @Matches(POSITIVE)
  amount!: string;

  @trim()
  @IsString()
  @Length(3, 300)
  reason!: string;

  @IsOptional()
  @trim()
  @IsString()
  @Length(3, 200)
  label?: string;
}

export class WorksheetCreateDto {
  @IsUUID()
  employeeId!: string;

  @Matches(MONTH)
  from!: string;

  @Matches(MONTH)
  to!: string;

  @trim()
  @IsString()
  @Length(5, 300)
  reason!: string;

  /** The past-dated pay change behind it (P06), when there is one. */
  @IsOptional()
  @IsUUID()
  changeId?: string;
}

export class BaseLineDto {
  @Matches(CODE)
  componentCode!: string;

  @Matches(MONEY)
  asPaid!: string;
}

export class ConfirmBaseDto {
  @Matches(MONTH)
  period!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => BaseLineDto)
  lines!: BaseLineDto[];

  @trim()
  @IsString()
  @Length(5, 300)
  reason!: string;
}

export class WorksheetApproveDto {
  /** Pay in this month's regular run (default: the current month), or in this off-cycle run. */
  @IsOptional()
  @Matches(MONTH)
  payMonth?: string;

  @IsOptional()
  @IsUUID()
  runId?: string;
}

export class DismissDto {
  @trim()
  @IsString()
  @Length(5, 300)
  reason!: string;
}

export class FnfItemChangeDto {
  @IsUUID()
  id!: string;

  @IsOptional()
  @Matches(POSITIVE)
  amount?: string;

  /** A reason holds the line back (paid in the second run); null releases it. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @Length(3, 300)
  holdReason?: string | null;

  @IsOptional()
  @IsBoolean()
  remove?: boolean;
}

export class FnfItemAddDto {
  @Matches(CODE)
  componentCode!: string;

  @Matches(POSITIVE)
  amount!: string;

  @trim()
  @IsString()
  @Length(3, 200)
  label!: string;
}

export class FnfPayeeDto {
  @IsIn(['nominee', 'heir'])
  kind!: 'nominee' | 'heir';

  @trim()
  @IsString()
  @Length(2, 100)
  name!: string;

  @trim()
  @IsString()
  @Length(2, 40)
  relation!: string;

  @Matches(/^\d{1,3}(\.\d{1,2})?$/)
  sharePercent!: string;

  @IsOptional()
  @Matches(/^\d{9,18}$/)
  accountNumber?: string;

  @IsOptional()
  @Matches(/^[A-Z]{4}0[A-Z0-9]{6}$/)
  ifsc?: string;
}

export class FnfPatchDto {
  @IsInt()
  @Min(1)
  version!: number;

  @trim()
  @IsString()
  @Length(5, 300)
  reason!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => FnfItemChangeDto)
  items?: FnfItemChangeDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => FnfItemAddDto)
  add?: FnfItemAddDto[];
}

export class FnfPayeesDto {
  @IsInt()
  @Min(1)
  version!: number;

  @trim()
  @IsString()
  @Length(5, 300)
  reason!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => FnfPayeeDto)
  payees!: FnfPayeeDto[];
}

export class OverpaymentDto {
  @IsUUID()
  employeeId!: string;

  @Matches(POSITIVE)
  amount!: string;

  @Matches(POSITIVE)
  instalment!: string;

  @trim()
  @IsString()
  @Length(5, 300)
  reason!: string;

  /** The tax year the overpayment was made in (default: this one), for cross-year reporting. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/)
  taxYear?: string;
}

export class OverpaymentListDto {
  @IsOptional()
  @IsIn(['true', 'false'])
  crossYear?: 'true' | 'false';
}

export class AnswerDto {
  @IsBoolean()
  agree!: boolean;
}

export class WriteOffDto {
  @trim()
  @IsString()
  @Length(5, 300)
  reason!: string;
}
