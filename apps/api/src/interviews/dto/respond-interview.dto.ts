import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class RespondInterviewDto {
  @IsIn(['confirm', 'decline', 'reschedule', 'book']) action!: 'confirm' | 'decline' | 'reschedule' | 'book';

  @IsOptional() @IsUUID() slotId?: string;

  @IsOptional() @IsString() @MaxLength(1000) note?: string;

  // Only meaningful for action:'book' (self_book mode) -- the candidate's chosen time. NEVER
  // trusted as-is: respondPublic re-derives generateBookableSlots fresh inside the tx and
  // requires an exact ISO match before creating anything (see interviews.service.ts).
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() endsAt?: string;
}
