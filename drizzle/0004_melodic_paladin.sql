CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`study_set_id` text,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`study_set_id`) REFERENCES `study_sets`(`id`) ON UPDATE no action ON DELETE cascade
);
