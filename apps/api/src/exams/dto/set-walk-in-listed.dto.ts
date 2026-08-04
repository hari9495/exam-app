import { IsBoolean } from 'class-validator';

export class SetWalkInListedDto {
  @IsBoolean()
  walkInListed!: boolean;
}
