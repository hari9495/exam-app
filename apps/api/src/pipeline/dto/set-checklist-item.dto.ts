import { IsBoolean, IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class SetChecklistItemDto {
  @IsString() @IsNotEmpty() @MaxLength(100) itemId!: string;
  @IsBoolean() done!: boolean;
}
