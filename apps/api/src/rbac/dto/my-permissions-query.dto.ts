import { Matches } from 'class-validator';

export class MyPermissionsQueryDto {
  /** Comma-separated permission keys, at most 30. */
  @Matches(/^[a-z_]+([.:][a-z_]+)+(,[a-z_]+([.:][a-z_]+)+){0,29}$/, { message: 'keys is a comma-separated list of up to 30 permission keys' })
  keys!: string;
}
