import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ScreenShareStateDto {
  @IsBoolean()
  active!: boolean;

  @IsOptional() @IsString() @MaxLength(50)
  displaySurface?: string;

  @IsOptional() @IsString() @MaxLength(400)
  userAgent?: string;

  // 'ended' -- the browser's Stop-sharing control (or the track's `ended` event) fired: a
  // genuine, strike-worthy stop. 'absent' -- the mount-time check found no live stream (e.g.
  // a page refresh, which cannot carry a getDisplayMedia stream across navigation): pause
  // only, never strike, since a refresh is indistinguishable from a tab crash. Missing
  // entirely (older client) defaults to 'ended' so today's behaviour doesn't silently change.
  @IsOptional() @IsIn(['ended', 'absent'])
  reason?: string;
}
