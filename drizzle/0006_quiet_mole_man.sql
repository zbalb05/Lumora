ALTER TABLE `documents` ADD `flashcards_completed_at` text;--> statement-breakpoint
ALTER TABLE `quizzes` ADD `completed_at` text;--> statement-breakpoint
ALTER TABLE `quizzes` ADD `last_correct_count` integer;