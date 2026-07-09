import { ArrayMinSize, IsArray, IsString } from 'class-validator';

export class SettleIfExpiredBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  attemptIds!: string[];
}
