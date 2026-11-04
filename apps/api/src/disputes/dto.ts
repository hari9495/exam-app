import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

// HLP-13 collective dispute inputs. Whitelisted by the global ValidationPipe (unknown fields are refused).

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
/** Payroll's worker categories (the job's skill class), as PAY-37 pays them. */
export const CATEGORIES = ['unskilled', 'semi_skilled', 'skilled', 'highly_skilled'] as const;

export class DisputeDto {
  /** For example "Charter of demands 2026". */
  @Text(3, 200)
  title!: string;

  /** The union (or the workers' group) that raised it, as the company knows it. */
  @Text(2, 200)
  unionName!: string;

  @IsUUID()
  locationId!: string;

  @IsInt()
  @Min(1)
  @Max(1_000_000)
  workersCovered!: number;

  @Day()
  receivedOn!: string;
}

export class DemandDto {
  @Text(3, 500)
  text!: string;

  /** What the union asks, in short. */
  @Text(1, 200)
  union!: string;

  /** The company's position, in short. */
  @Text(1, 200)
  mgmt!: string;
}

export class DemandUpdateDto {
  @IsIn(['open', 'agreed', 'withdrawn', 'rejected'])
  status!: 'open' | 'agreed' | 'withdrawn' | 'rejected';

  /** What was agreed (needed when agreed). */
  @Opt(200)
  agreed?: string;

  /** The company's position now. */
  @Opt(200)
  mgmt?: string;
}

export class MeetingDto {
  @IsIn(['bipartite', 'conciliation'])
  kind!: 'bipartite' | 'conciliation';

  @Day()
  on!: string;

  /** The conciliation officer (needed for a conciliation meeting). */
  @Opt(150)
  officer?: string;

  @Text(2, 500)
  attended!: string;

  @Text(10, 5_000)
  minutes!: string;

  /** The minutes as a paper of this dispute (uploaded first). */
  @IsOptional()
  @IsUUID()
  paperId?: string;

  /** The next meeting fixed at this one. */
  @IsOptional()
  @Day()
  nextOn?: string;
}

export class RateDto {
  @IsIn(CATEGORIES)
  category!: (typeof CATEGORIES)[number];

  /** Rupees a month, up to 2 decimals. */
  @Matches(/^\d{1,7}(\.\d{1,2})?$/, { message: 'Rupees a month, like 1500 or 1500.50.' })
  monthlyIncrease!: string;
}

export class SettlementDto {
  @IsIn(['conciliation', 'bipartite'])
  kind!: 'conciliation' | 'bipartite';

  @Day()
  signedOn!: string;

  @Day()
  effectiveFrom!: string;

  @IsOptional()
  @Day()
  effectiveTo?: string;

  /** The worker categories it covers, in words. */
  @Text(3, 300)
  covered!: string;

  /** The agreed terms, as signed. */
  @Text(10, 5_000)
  terms!: string;

  /** The pay terms payroll pays as arrears: a monthly increase per worker category. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => RateDto)
  rates!: RateDto[];

  /** The signed copy, a paper of this dispute (uploaded first). */
  @IsUUID()
  paperId!: string;
}

export class ReasonDto {
  @Text(5, 1_000)
  reason!: string;
}

export class FiledDto {
  @Day()
  on!: string;

  /** The authority's receipt or reference number. */
  @Opt(80)
  ref?: string;
}

export class CloseDto {
  @IsIn(['withdrawn', 'no-settlement'])
  how!: 'withdrawn' | 'no-settlement';

  @Text(5, 1_000)
  note!: string;
}

export class PaperDto {
  @Text(2, 150)
  title!: string;
}
