import { HttpException, HttpStatus } from '@nestjs/common';

export class QuotaExceededException extends HttpException {
  constructor(dimension: string, used: number, limit: number) {
    super(
      { error: 'quota_exceeded', dimension, used, limit, message: `Plan limit reached for ${dimension}. Upgrade to continue.` },
      HttpStatus.PAYMENT_REQUIRED, // 402
    );
  }
}
