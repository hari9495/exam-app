import { IsNotEmpty, IsString } from 'class-validator';

export class BulkUploadCandidatesDto {
  @IsString()
  @IsNotEmpty()
  csvContent!: string;
}
