import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class RespondInterviewDto {
  @IsIn(['confirm', 'decline', 'reschedule']) action!: 'confirm' | 'decline' | 'reschedule';

  @IsOptional() @IsUUID() slotId?: string;

  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}
