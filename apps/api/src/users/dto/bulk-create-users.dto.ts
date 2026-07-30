import { ArrayMaxSize, ArrayMinSize, IsArray, IsEmail, IsIn } from 'class-validator';

const CREATABLE_ROLES = ['org_admin', 'recruiter', 'panel'] as const;

export class BulkCreateUsersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsEmail({}, { each: true })
  emails!: string[];

  @IsIn(CREATABLE_ROLES)
  role!: string;
}
