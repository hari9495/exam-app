import { Body, Controller, HttpCode, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';

const REFRESH_COOKIE = 'refresh_token';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('staff/login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.authService.login(dto);
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, { httpOnly: true, sameSite: 'lax', secure: false });
    return { accessToken: tokens.accessToken };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() dto: RefreshDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.authService.refresh(dto.refreshToken);
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, { httpOnly: true, sameSite: 'lax', secure: false });
    return { accessToken: tokens.accessToken };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Body() dto: RefreshDto, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(dto.refreshToken);
    res.clearCookie(REFRESH_COOKIE);
    return { success: true };
  }
}
