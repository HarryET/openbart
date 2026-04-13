CREATE TABLE `api_keys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key_hash` varchar(64) NOT NULL,
	`key_prefix` varchar(12) NOT NULL,
	`owner_name` varchar(255) NOT NULL,
	`owner_email` varchar(255),
	`rate_limit_per_minute` int NOT NULL DEFAULT 300,
	`is_active` int NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`last_used_at` timestamp,
	CONSTRAINT `api_keys_id` PRIMARY KEY(`id`),
	CONSTRAINT `api_keys_key_hash_unique` UNIQUE(`key_hash`)
);
--> statement-breakpoint
CREATE INDEX `idx_api_keys_hash` ON `api_keys` (`key_hash`);