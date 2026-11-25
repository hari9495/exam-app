import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { OfferTemplatesToLetters } from './offer-letters';

// Answer 2515: the one-off move of the older offer templates into P05 'offer' letter templates.
//   npm run offers:to-letters   (apps/api, after `nest build`; safe to run again: moved templates are skipped)
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  try {
    const { moved, failed } = await app.get(OfferTemplatesToLetters).run();
    console.log(`Offer templates moved to Letters: ${moved}. Failed: ${failed}.`);
    process.exitCode = failed ? 1 : 0;
  } finally {
    await app.close();
  }
}
void main();
