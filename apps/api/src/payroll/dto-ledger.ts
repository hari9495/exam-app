import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/** GP-PAY-1: one mapping (a company default, or an override for a legal entity or cost centre). */
export class LedgerMappingDto {
  @IsIn(['company', 'legal_entity', 'cost_centre'])
  scopeType!: 'company' | 'legal_entity' | 'cost_centre';

  @IsOptional()
  @IsUUID()
  scopeId?: string;

  /** A pay component's code, or _net_pay for net salary payable. */
  @Matches(/^(_net_pay|[a-z0-9_]{1,30})$/)
  componentCode!: string;

  @IsIn(['expense', 'payable'])
  side!: 'expense' | 'payable';

  @trim()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9 ./_-]{0,39}$/, { message: 'An account code is letters, digits, space, . / _ or -.' })
  accountCode!: string;

  @trim()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  accountName!: string;
}
