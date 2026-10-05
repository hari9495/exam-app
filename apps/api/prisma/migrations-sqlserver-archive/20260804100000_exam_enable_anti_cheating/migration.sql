-- Master switch for every anti-cheating measure (webcam proctoring, browser-behavior
-- signals, screen capture, SEB lockdown). Defaults to 1 so every existing exam keeps
-- its current proctoring behavior unchanged -- this column only starts mattering once
-- a recruiter explicitly turns it off for an exam.
ALTER TABLE [dbo].[exams] ADD [enable_anti_cheating] BIT NOT NULL CONSTRAINT [exams_enable_anti_cheating_df] DEFAULT 1;
