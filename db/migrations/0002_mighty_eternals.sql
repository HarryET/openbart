CREATE TABLE `line_status_hourly` (
	`id` int AUTO_INCREMENT NOT NULL,
	`route_color` varchar(20) NOT NULL,
	`hour` timestamp NOT NULL,
	`total_stops` int NOT NULL DEFAULT 0,
	`delay_sum` int NOT NULL DEFAULT 0,
	`on_time_count` int NOT NULL DEFAULT 0,
	`max_delay` int NOT NULL DEFAULT 0,
	`snapshot_count` int NOT NULL DEFAULT 0,
	CONSTRAINT `line_status_hourly_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_lsh_color_hour` ON `line_status_hourly` (`route_color`,`hour`);--> statement-breakpoint
CREATE INDEX `idx_lsh_hour` ON `line_status_hourly` (`hour`);