import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

// Bulk action over selected pipeline entries. move = set statusId (any status incl. an
// archived-category one); reject = flag rejected; assign = set assignee user/group. Each entry is
// processed independently and reported in the {succeeded, skipped[]} tally, so one bad entry never
// fails the batch.
export class BulkPatchEntriesDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  entryIds!: string[];

  @IsIn(['move', 'reject', 'assign'])
  action!: string;

  @IsOptional()
  @IsUUID()
  statusId?: string; // required for 'move'

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string; // 'reject' (and carried into a 'move')

  @IsOptional()
  @IsUUID()
  assigneeUserId?: string; // 'assign'

  @IsOptional()
  @IsUUID()
  assigneeGroupId?: string; // 'assign'
}
