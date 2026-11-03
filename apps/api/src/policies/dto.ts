import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, Equals, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, MinLength } from 'class-validator';

// HLP-10 / HLP-11 company policy inputs. Whitelisted by the global ValidationPipe (unknown fields are refused).

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value));
const Text = (min: number, max: number) => (target: object, key: string) => {
  trim()(target, key);
  IsString()(target, key);
  MinLength(min)(target, key);
  MaxLength(max)(target, key);
};
const Ids = () => (target: object, key: string) => {
  IsOptional()(target, key);
  IsArray()(target, key);
  ArrayUnique()(target, key);
  ArrayMaxSize(200)(target, key);
  IsUUID('all', { each: true })(target, key);
};
export const POLICY_METHODS = ['click', 'otp'] as const;
export type PolicyMethod = (typeof POLICY_METHODS)[number];
const HTML_MAX = 200_000;

export class NewPolicyDto {
  @Text(3, 150)
  title!: string;

  @Text(2, 60)
  category!: string;

  @IsIn(POLICY_METHODS)
  method!: PolicyMethod;
}

export class PolicyChangeDto {
  @IsInt()
  @Min(1)
  version!: number;

  @IsOptional()
  @Text(3, 150)
  title?: string;

  @IsOptional()
  @Text(2, 60)
  category?: string;

  @IsOptional()
  @IsIn(POLICY_METHODS)
  method?: PolicyMethod;

  @IsOptional()
  @IsUUID()
  ownerUserId?: string;

  @Ids()
  legalEntityIds?: string[];

  @Ids()
  locationIds?: string[];

  @Ids()
  departmentIds?: string[];

  @Ids()
  gradeIds?: string[];
}

export class DraftDto {
  /** The open version's row version; absent to start a new version. */
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;

  @IsString()
  @MaxLength(HTML_MAX)
  bodyHtml!: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(500)
  changeSummary?: string;

  @IsOptional()
  @IsBoolean()
  reack?: boolean;
}

export class SubmitDto {
  @IsInt()
  @Min(1)
  version!: number;
}

export class SendBackDto {
  @IsInt()
  @Min(1)
  version!: number;

  @Text(3, 500)
  note!: string;
}

export class RemindDto {
  /** The ticked people; none = everyone pending. */
  @Ids()
  employeeIds?: string[];
}

export class PendingQueryDto {
  @IsOptional()
  @IsUUID()
  departmentId?: string;
}

export class AcknowledgeDto {
  /** The version the person read: only the current one is accepted. */
  @IsUUID()
  versionId!: string;

  @IsBoolean()
  @Equals(true, { message: 'Tick that you have read and understood the policy.' })
  read!: boolean;

  @IsOptional()
  @Text(1, 200)
  typedName?: string;

  @IsOptional()
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code.' })
  code?: string;
}
