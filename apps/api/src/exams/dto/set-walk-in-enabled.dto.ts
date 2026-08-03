import { IsBoolean } from 'class-validator';

export class SetWalkInEnabledDto {
  @IsBoolean()
  walkInEnabled!: boolean;
}
