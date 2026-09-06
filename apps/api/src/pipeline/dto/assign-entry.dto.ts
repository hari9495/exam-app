import { IsOptional, IsUUID, ValidateIf } from 'class-validator';

export class AssignEntryDto {
  // A UUID assigns the candidate to that teammate; explicit null unassigns. Exactly one of
  // assigneeUserId/assigneeGroupId may be non-null (XOR) -- see PipelineService.assignEntry.
  @ValidateIf((o) => o.assigneeUserId !== null && o.assigneeUserId !== undefined)
  @IsUUID()
  @IsOptional()
  assigneeUserId?: string | null;

  @ValidateIf((o) => o.assigneeGroupId !== null && o.assigneeGroupId !== undefined)
  @IsUUID()
  @IsOptional()
  assigneeGroupId?: string | null;
}
