import { IsIn } from 'class-validator';

export class ExportFormatQueryDto {
  @IsIn(['csv', 'xlsx', 'pdf'])
  format!: 'csv' | 'xlsx' | 'pdf';
}
