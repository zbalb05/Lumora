CREATE TABLE `sync_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`table_name` text NOT NULL,
	`row_id` text NOT NULL,
	`operation` text NOT NULL,
	`payload` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text
);
