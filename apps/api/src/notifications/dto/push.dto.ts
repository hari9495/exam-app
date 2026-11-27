import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** T2-E 52 (2875): this device's Web Push subscription, as the browser gives it. */
export class PushSubscriptionDto {
  @IsString() @MinLength(10) @MaxLength(1000) endpoint!: string;
  @IsString() @MinLength(10) @MaxLength(200) @Matches(/^[A-Za-z0-9_-]+=*$/) p256dh!: string;
  @IsString() @MinLength(8) @MaxLength(100) @Matches(/^[A-Za-z0-9_-]+=*$/) auth!: string;
  @IsOptional() @IsString() @MaxLength(400) userAgent?: string;
}

export class PushEndpointDto {
  @IsString() @MinLength(10) @MaxLength(1000) endpoint!: string;
}

/** T2-E 52 (2877): Pause push and the quiet hours (India time, HH:MM). */
export class PushChoicesDto {
  @IsOptional() @IsBoolean() paused?: boolean;
  @IsOptional() @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) quietFrom?: string;
  @IsOptional() @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) quietTo?: string;
}
