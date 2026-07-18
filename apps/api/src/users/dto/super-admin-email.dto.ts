import { IsEmail } from 'class-validator';

export class SuperAdminEmailDto {
  @IsEmail()
  email!: string;
}
