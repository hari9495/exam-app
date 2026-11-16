import { Equals, IsUUID } from 'class-validator';

/** AS-3 (answer 2013, PRC-32): use an earlier result; the candidate must agree. */
export class ReuseDto {
  @IsUUID()
  attemptId!: string;

  @Equals(true, { message: 'Agree that the company may use your earlier result for this job.' })
  agree!: boolean;
}
