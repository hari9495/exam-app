import { Injectable, Logger } from '@nestjs/common';
import * as pkijs from 'pkijs';
import { todayIst } from '../org-structure/org-validation';
import { StatutoryRulesService } from '../statutory/statutory.service';
import { inForce } from '../statutory/evaluator';
import { CCA_ROOTS, rootsOf } from './cca-roots';
import type { TrustedRoots } from './signed-pdf';

/** The published CCA roots in force today (the rule store's 5-minute cache; a new publication is picked up). */
@Injectable()
export class PublishedCcaRoots implements TrustedRoots {
  private readonly logger = new Logger(PublishedCcaRoots.name);
  constructor(private readonly rules: StatutoryRulesService) {}

  async get(): Promise<pkijs.Certificate[]> {
    const rs = inForce(await this.rules.published(), CCA_ROOTS, ['IN'], todayIst());
    return rs ? rootsOf(rs, this.logger) : [];
  }
}
