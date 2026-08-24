import { IsUUID, ValidateIf } from 'class-validator';

export class AssignEntryDto {
  // A UUID assigns the candidate to that teammate; explicit null unassigns.
  @ValidateIf((o) => o.assigneeUserId !== null)
  @IsUUID()
  assigneeUserId!: string | null;
}
