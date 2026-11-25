import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DocumentsModule } from '../documents/documents.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CoursesController, MyLearningController } from './learning.controller';
import { CoursesService } from './courses.service';

// Batch G3 (M07 Learning): courses, the catalogue, my learning and certificates (G3a); sessions, rules and skills next.
@Module({
  imports: [AuthModule, DocumentsModule, NotificationsModule],
  controllers: [CoursesController, MyLearningController],
  providers: [CoursesService],
})
export class LearningModule {}
