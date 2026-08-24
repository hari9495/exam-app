import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class AddFeedbackDto {
  @IsOptional() @IsString() @MaxLength(5000) note?: string;
  @IsOptional() @IsInt() @Min(1) @Max(5) rating?: number;
  // Teammates @mentioned in the note (the picker supplies their user ids); each is validated
  // against the org before a notification is created.
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsUUID(undefined, { each: true }) mentionedUserIds?: string[];
}
