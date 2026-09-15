import { IsUUID } from 'class-validator';

// A staff member self-applying to an internal opening. Identity (name/email) comes from the session
// User, not the client -- so the DTO carries only the chosen job.
export class ApplyInternalDto {
  @IsUUID('4') jobId!: string;
}
