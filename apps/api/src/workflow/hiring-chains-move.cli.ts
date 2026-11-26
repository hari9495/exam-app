import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { HiringChainsMove } from './hiring-chains-move';

// E2 part 6 (answer 2789): moves every company's old hiring approval chains into approval policies where the dry run
// shows the same approvers, and lists the rest for HR (they see the same list under Hiring › Approvals).
//   npm run hiring:move-chains   (apps/api, after `nest build`; safe to run again: moved types are skipped)
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  try {
    for (const r of await app.get(HiringChainsMove).runAll()) {
      console.log(`${r.organizationId}: moved ${r.moved.join(', ') || 'nothing'}`);
      for (const t of r.left) console.log(`  ${t.label} not moved, ${t.differences.length} differences: ${t.differences.slice(0, 3).map((d) => `${d.step} (${d.why})`).join('; ')}`);
    }
  } finally {
    await app.close();
  }
}
void main();
