import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

// Service Desk 3b-2 batch 1 inputs (M14 §12.2: catalogue, order guides, question library, checkout, ad-hoc
// approvals, rules). Forms, conditions, approval steps, fulfilment plans and rule parts are JSON checked by the
// P18 / P19 / P03 engines (parseForm, parseGroup, parseSteps, AutomationService.parse), never trusted as typed here.

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const Text = (min: number, max: number) => (target: object, key: string) => {
  trim()(target, key);
  IsString()(target, key);
  MinLength(min)(target, key);
  MaxLength(max)(target, key);
};

export class ItemDraftDto {
  @IsOptional()
  @IsString()
  @MaxLength(100_000)
  bodyHtml?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  media?: unknown[];

  @IsOptional()
  @IsObject()
  form?: unknown;

  @IsOptional()
  @IsArray()
  approval?: unknown[];

  @IsOptional()
  @IsArray()
  fulfilment?: unknown[];
}

export class CatalogItemDto {
  @IsUUID()
  deskId!: string;

  @Text(1, 100)
  name!: string;

  @IsOptional()
  @Text(0, 300)
  shortText?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1e9)
  cost?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  deliveryDays?: number | null;

  /** SD-2.08: only for joiner / leaver journeys; never listed in the catalogue. */
  @IsOptional()
  @IsBoolean()
  journeyOnly?: boolean;

  @IsOptional()
  @IsObject()
  audience?: unknown;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  sortOrder?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => ItemDraftDto)
  draft?: ItemDraftDto;
}

export class UpdateCatalogItemDto {
  @IsInt()
  version!: number;

  @IsOptional()
  @Text(1, 100)
  name?: string;

  @IsOptional()
  @Text(0, 300)
  shortText?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1e9)
  cost?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  deliveryDays?: number | null;

  /** SD-2.08: only for joiner / leaver journeys; never listed in the catalogue. */
  @IsOptional()
  @IsBoolean()
  journeyOnly?: boolean;

  /** null = everyone who can raise to the desk. */
  @IsOptional()
  @IsObject()
  audience?: unknown;

  @IsOptional()
  @IsBoolean()
  everyone?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  sortOrder?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => ItemDraftDto)
  draft?: ItemDraftDto;
}

export class CatalogSettingsDto {
  /** Rupees: an order costing more than this always needs a person to approve it (never auto-approved). */
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  highValueAbove!: number;
}

export class VersionOnlyDto {
  @IsInt()
  version!: number;
}

export class QuestionnaireDto {
  @IsOptional()
  @IsInt()
  version?: number;

  @Text(1, 100)
  name!: string;

  @IsOptional()
  @Text(0, 300)
  description?: string;

  @IsArray()
  @ArrayMaxSize(60)
  fields!: unknown[];

  @IsOptional()
  @IsArray()
  rules?: unknown[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class OrderGuideDto {
  @IsOptional()
  @IsInt()
  version?: number;

  @Text(1, 100)
  name!: string;

  @IsOptional()
  @Text(0, 300)
  description?: string;

  @IsObject()
  form!: unknown;

  /** [{ id, when: P19 group over the answers, itemIds }] */
  @IsArray()
  @ArrayMaxSize(40)
  rules!: unknown[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class AnswersDto {
  @IsOptional()
  @IsObject()
  answers?: Record<string, unknown>;
}

export class CartLineDto {
  @IsUUID()
  itemId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  quantity?: number;

  @IsOptional()
  @IsObject()
  answers?: Record<string, unknown>;
}

export class CheckoutDto {
  /** US-G-041: the cart raised for someone else (needs request.raise_on_behalf over them). */
  @IsOptional()
  @IsUUID()
  forPersonId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CartLineDto)
  items!: CartLineDto[];
}

export class CancelDto {
  @IsOptional()
  @Text(0, 300)
  reason?: string;
}

export class PickQueryDto {
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(60)
  q?: string;
}

export class AdhocApprovalDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  userIds!: string[];

  @IsOptional()
  @IsIn(['any', 'all'])
  mode?: 'any' | 'all';

  @Text(1, 500)
  question!: string;
}

export class RuleDto {
  @IsUUID()
  deskId!: string;

  @Text(1, 100)
  name!: string;

  @IsOptional()
  @Text(0, 500)
  description?: string;

  @IsObject()
  trigger!: unknown;

  @IsOptional()
  @IsObject()
  condition?: unknown;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  actions!: unknown[];

  @IsOptional()
  @IsBoolean()
  stopAfter?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000)
  maxRunsPerHour?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  sortOrder?: number;
}

export class UpdateRuleDto {
  @IsInt()
  version!: number;

  @IsOptional()
  @Text(1, 100)
  name?: string;

  @IsOptional()
  @Text(0, 500)
  description?: string;

  @IsOptional()
  @IsObject()
  trigger?: unknown;

  @IsOptional()
  @IsObject()
  condition?: unknown;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  actions?: unknown[];

  @IsOptional()
  @IsBoolean()
  stopAfter?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000)
  maxRunsPerHour?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  sortOrder?: number;

  @IsOptional()
  @Text(0, 300)
  changeNote?: string;
}

export class RuleStatusDto {
  @IsInt()
  version!: number;

  @IsIn(['active', 'paused', 'retired'])
  status!: 'active' | 'paused' | 'retired';
}

export class RecipeInstallDto {
  @IsUUID()
  deskId!: string;
}

export class WebhookDto {
  @Text(1, 100)
  name!: string;

  @Text(9, 500)
  url!: string;
}

export class WebhookActiveDto {
  @IsBoolean()
  active!: boolean;
}

export class DeskQueryDto {
  @IsUUID()
  deskId!: string;
}

export class CostCentreOwnerDto {
  @IsOptional()
  @IsUUID()
  ownerUserId?: string | null;
}
