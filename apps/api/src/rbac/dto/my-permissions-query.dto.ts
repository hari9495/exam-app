import { Matches, MaxLength } from 'class-validator';

export class MyPermissionsQueryDto {
  /** Comma-separated permission keys, at most 120 (the YukthiX menu asks for about 65 since lifecycle batch 6b). */
  @MaxLength(6000)
  @Matches(/^[a-z_]+([.:][a-z_]+)+(,[a-z_]+([.:][a-z_]+)+){0,119}$/, { message: 'keys is a comma-separated list of up to 120 permission keys' })
  keys!: string;
}
