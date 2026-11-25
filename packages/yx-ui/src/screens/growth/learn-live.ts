// Learning (M07), wired to the API (batch G3). Import the stylesheet once: '@yukthix/ui/styles.css'.
// G3a: LRN-01 My learning, LRN-02 player, LRN-03 course builder, LRN-06 nominate.
export { MyLearningScreen, CoursePlayerScreen, EnrolmentSheet } from './learn-me';
export { CourseBuilderScreen } from './learn-admin';
export type { CourseInput, LiveCourse, LiveCourseBuilder, LiveCourseItem, LiveEnrolment, LiveMyLearning, LiveNominate, LivePlayer } from './learn-courses-live';
// G3b: LRN-04 sessions, LRN-05 trainer attendance code, LRN-12 reaction and the manager's check; seats in the player.
export { SessionsScreen, TrainerQrScreen } from './learn-admin';
export { TrainingFeedbackScreen } from './learn-me';
export { slotText } from './learn-sessions-live';
export type { LiveFeedback, LiveMySession, LiveMySessions, LiveSessionPage, LiveSessionRow, LiveSessions, LiveSlot, LiveTrainerCode, SessionInput } from './learn-sessions-live';
