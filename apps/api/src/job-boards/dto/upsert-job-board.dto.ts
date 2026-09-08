import { IsOptional, IsString, MaxLength } from 'class-validator';

// Shared by POST (name required, enforced in the service since Prisma requires it
// anyway) and PATCH (name optional -- a rename is the only field there is to change).
export class UpsertJobBoardDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;
}
