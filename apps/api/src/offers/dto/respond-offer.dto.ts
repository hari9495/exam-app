import { IsBoolean, IsIn, IsOptional, Matches } from 'class-validator';

export class RespondOfferDto {
  @IsIn(['accept', 'decline']) action!: 'accept' | 'decline';
  /** HIR-09 e-sign: the emailed one-time code (only when the offer's template switched e-sign on). */
  @IsOptional() @Matches(/^\d{6}$/, { message: 'The code is 6 digits.' }) code?: string;
  @IsOptional() @IsBoolean() disclosureAccepted?: boolean;
}
