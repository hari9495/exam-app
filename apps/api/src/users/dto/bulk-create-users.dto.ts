import { ArrayMaxSize, ArrayMinSize, IsArray, IsEmail, IsIn } from 'class-validator';
import { CREATABLE_ROLES } from '../../rbac/roles';

export class BulkCreateUsersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsEmail({}, { each: true })
  emails!: string[];

  @IsIn(CREATABLE_ROLES)
  role!: string;
}
