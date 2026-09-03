import { IsIn, IsOptional, IsString } from 'class-validator';

export class DecideDto {
  @IsIn(['approved', 'rejected']) decision!: 'approved' | 'rejected';
  @IsOptional() @IsString() note?: string;
}
