import { Matches, MaxLength } from 'class-validator';

export class MyPermissionsQueryDto {
  /** Comma-separated permission keys, at most 250 (the YukthiX menu asked for 122 once performance PM7 and payroll 5i met; the web test guards it). */
  @MaxLength(6000)
  @Matches(/^[a-z_]+([.:][a-z_]+)+(,[a-z_]+([.:][a-z_]+)+){0,249}$/, { message: 'keys is a comma-separated list of up to 250 permission keys' })
  keys!: string;
}
