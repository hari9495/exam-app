import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ClientErrorDto {
  // What broke, machine-readable: 'js_error' | 'unhandled_rejection' | 'api_failure' |
  // anything future instrumentation names. Free-form (capped) rather than a closed enum so
  // adding a new client-side probe never requires a backend deploy first.
  @IsString()
  @MaxLength(60)
  kind!: string;

  @IsString()
  @MaxLength(1000)
  message!: string;

  // Where in the app it happened (route, question id, HTTP status, ...). Values only --
  // truncated server-side into the event's contextJson.
  @IsOptional() @IsString() @MaxLength(2000)
  detail?: string;

  @IsOptional() @IsIn(['error', 'warn'])
  severity?: 'error' | 'warn';
}
