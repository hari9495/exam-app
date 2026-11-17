import { Module } from '@nestjs/common';
import { AiModule } from '../../ai/ai.module';
import { ExamRuntimeClientModule } from '../../exam-runtime-client/exam-runtime-client.module';
import { FairnessController } from './fairness.controller';
import { FairnessService } from './fairness.service';
import { MarkSuggestionClient } from './mark-suggestion.client';
import { MarkingController } from './marking.controller';
import { MarkingService } from './marking.service';

// Assessments AS-6: marking (PRC-19) and fairness (answers 2019, 2165).
@Module({
  imports: [AiModule, ExamRuntimeClientModule],
  controllers: [MarkingController, FairnessController],
  providers: [MarkingService, FairnessService, MarkSuggestionClient],
})
export class AsmtMarkingModule {}
