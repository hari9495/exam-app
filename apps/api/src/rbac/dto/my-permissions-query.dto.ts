import { Matches } from 'class-validator';

export class MyPermissionsQueryDto {
  /** Comma-separated permission keys, at most 60 (the YukthiX menu asks for about 35 since the Service Desk batch 4). */
  @Matches(/^[a-z_]+([.:][a-z_]+)+(,[a-z_]+([.:][a-z_]+)+){0,59}$/, { message: 'keys is a comma-separated list of up to 60 permission keys' })
  keys!: string;
}
