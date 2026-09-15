import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Min, MaxLength } from 'class-validator';

export class UpsertPlanDto {
  @IsString() @MaxLength(100) name!: string;
  @IsInt() @Min(0) seatLimit!: number;
  @IsInt() @Min(0) candidateLimit!: number;
  @IsInt() @Min(0) aiCreditLimit!: number;
  @IsInt() @Min(0) proctoringMinutesLimit!: number;
  @IsOptional() @IsString() @MaxLength(50) priceLabel?: string;
  @IsOptional() @IsBoolean() isPublic?: boolean;
  // Stripe wiring (set by a platform admin): the Stripe Price a self-serve checkout subscribes to,
  // and its parent Product. A plan without stripePriceId is not purchasable (admin-assigned only).
  @IsOptional() @IsString() @MaxLength(255) stripeProductId?: string;
  @IsOptional() @IsString() @MaxLength(255) stripePriceId?: string;
}

export class AssignPlanDto {
  @IsUUID('4') planId!: string;
}
