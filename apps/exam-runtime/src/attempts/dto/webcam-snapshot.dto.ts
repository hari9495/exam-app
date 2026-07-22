import { IsString } from 'class-validator';

export class WebcamSnapshotDto {
  @IsString()
  snapshot!: string;
}
