import { IsArray, IsUUID, ArrayMaxSize } from 'class-validator';

export class SetMembersDto {
  @IsArray() @ArrayMaxSize(500) @IsUUID(undefined, { each: true }) userIds!: string[];
}
