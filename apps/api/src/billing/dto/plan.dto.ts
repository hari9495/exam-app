import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Min, MaxLength } from 'class-validator';

export class UpsertPlanDto {
  @IsString() @MaxLength(100) name!: string;
  @IsInt() @Min(0) seatLimit!: number;
  @IsInt() @Min(0) candidateLimit!: number;
  @IsInt() @Min(0) aiCreditLimit!: number;
  @IsInt() @Min(0) proctoringMinutesLimit!: number;
  @IsOptional() @IsString() @MaxLength(50) priceLabel?: string;
  @IsOptional() @IsBoolean() isPublic?: boolean;
}

export class AssignPlanDto {
  @IsUUID('4') planId!: string;
}
