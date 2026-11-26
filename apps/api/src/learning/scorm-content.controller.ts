import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { LearningService } from './learning.service';

// Answer 2781: SCORM package files, served only on the separate content origin (SCORM_CONTENT_ORIGIN, a host that
// reaches this API but is never the app's). No sign-in and no cookies: a short-lived signed token in the path names
// the company, the package and the enrolment, and relative links inside the package keep working under it. The
// service refuses everything else (another host, a bad or expired token, a file of another package, a file not yet
// clean) and sets the Content Security Policy on every file.
@Controller('scorm')
export class ScormContentController {
  constructor(private readonly learning: LearningService) {}

  // A package loads many small files as the learner moves through it.
  @Get(':token/*path')
  @Throttle({ default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : 1200, ttl: seconds(60) } })
  async file(@Req() req: Request, @Res() res: Response, @Param('token') token: string, @Param('path') path: string | string[]) {
    const out = await this.learning.scormContent(token, Array.isArray(path) ? path.join('/') : path, req.headers.host);
    res.status(out.status).set(out.headers).send(out.body);
  }
}
