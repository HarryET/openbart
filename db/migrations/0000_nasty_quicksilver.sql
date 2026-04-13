CREATE TABLE `agencies` (
	`id` varchar(255) NOT NULL,
	`name` varchar(255) NOT NULL,
	`url` text,
	`timezone` varchar(255),
	`phone` varchar(50),
	CONSTRAINT `agencies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `alert_informed_entities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`alert_id` int NOT NULL,
	`agency_id` varchar(255),
	`route_id` varchar(255),
	`stop_id` varchar(255),
	`direction_id` int,
	`route_type` int,
	`trip_id` varchar(255),
	CONSTRAINT `alert_informed_entities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `alert_versions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`alert_id` int NOT NULL,
	`header_text` text,
	`description_text` text,
	`url` text,
	`cause` int,
	`effect` int,
	`severity_level` int,
	`active_periods` json,
	`informed_entities` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `alert_versions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`feed_entity_id` varchar(255) NOT NULL,
	`header_text` text,
	`description_text` text,
	`url` text,
	`cause` int,
	`effect` int,
	`severity_level` int,
	`active_periods` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	`deleted_at` timestamp,
	CONSTRAINT `alerts_id` PRIMARY KEY(`id`),
	CONSTRAINT `alerts_feed_entity_id_unique` UNIQUE(`feed_entity_id`)
);
--> statement-breakpoint
CREATE TABLE `calendar` (
	`service_id` varchar(255) NOT NULL,
	`monday` int NOT NULL,
	`tuesday` int NOT NULL,
	`wednesday` int NOT NULL,
	`thursday` int NOT NULL,
	`friday` int NOT NULL,
	`saturday` int NOT NULL,
	`sunday` int NOT NULL,
	`start_date` varchar(8) NOT NULL,
	`end_date` varchar(8) NOT NULL,
	CONSTRAINT `calendar_service_id` PRIMARY KEY(`service_id`)
);
--> statement-breakpoint
CREATE TABLE `calendar_dates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`service_id` varchar(255) NOT NULL,
	`date` varchar(8) NOT NULL,
	`exception_type` int NOT NULL,
	CONSTRAINT `calendar_dates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `feed_info` (
	`id` int AUTO_INCREMENT NOT NULL,
	`feed_version` varchar(255) NOT NULL,
	`feed_publisher_name` text,
	`feed_publisher_url` text,
	`feed_lang` varchar(10),
	`feed_start_date` varchar(8),
	`feed_end_date` varchar(8),
	`fetched_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `feed_info_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gtfs_static_audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`feed_version_old` varchar(255),
	`feed_version_new` varchar(255) NOT NULL,
	`table_name` varchar(255) NOT NULL,
	`rows_added` int NOT NULL DEFAULT 0,
	`rows_removed` int NOT NULL DEFAULT 0,
	`rows_modified` int NOT NULL DEFAULT 0,
	`details` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gtfs_static_audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `routes` (
	`id` varchar(255) NOT NULL,
	`agency_id` varchar(255),
	`short_name` varchar(255),
	`long_name` text,
	`type` int,
	`color` varchar(20),
	`text_color` varchar(20),
	CONSTRAINT `routes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `shapes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`shape_id` varchar(255) NOT NULL,
	`shape_pt_lat` decimal(12,8) NOT NULL,
	`shape_pt_lon` decimal(12,8) NOT NULL,
	`shape_pt_sequence` int NOT NULL,
	`shape_dist_traveled` decimal(12,4),
	CONSTRAINT `shapes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stop_time_updates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`snapshot_id` int NOT NULL,
	`stop_id` varchar(255) NOT NULL,
	`stop_sequence` int,
	`arrival_delay` int,
	`arrival_time` int,
	`arrival_uncertainty` int,
	`departure_delay` int,
	`departure_time` int,
	`departure_uncertainty` int,
	`schedule_relationship` int,
	CONSTRAINT `stop_time_updates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stop_times` (
	`id` int AUTO_INCREMENT NOT NULL,
	`trip_id` varchar(255) NOT NULL,
	`stop_id` varchar(255) NOT NULL,
	`arrival_time` varchar(10),
	`departure_time` varchar(10),
	`stop_sequence` int NOT NULL,
	`pickup_type` int,
	`drop_off_type` int,
	CONSTRAINT `stop_times_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stops` (
	`id` varchar(255) NOT NULL,
	`name` varchar(255) NOT NULL,
	`lat` decimal(12,8),
	`lon` decimal(12,8),
	`parent_station` varchar(255),
	`platform_code` varchar(20),
	`location_type` int,
	CONSTRAINT `stops_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `transfers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`from_stop_id` varchar(255) NOT NULL,
	`to_stop_id` varchar(255) NOT NULL,
	`transfer_type` int,
	`min_transfer_time` int,
	CONSTRAINT `transfers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `trip_update_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`trip_id` varchar(255) NOT NULL,
	`vehicle_label` varchar(50),
	`schedule_relationship` int,
	`feed_timestamp` int,
	`snapshot_time` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `trip_update_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `trips` (
	`id` varchar(255) NOT NULL,
	`route_id` varchar(255) NOT NULL,
	`service_id` varchar(255) NOT NULL,
	`trip_headsign` text,
	`direction_id` int,
	`block_id` varchar(255),
	`shape_id` varchar(255),
	CONSTRAINT `trips_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_shapes_id_seq` ON `shapes` (`shape_id`,`shape_pt_sequence`);--> statement-breakpoint
CREATE INDEX `idx_stu_snapshot` ON `stop_time_updates` (`snapshot_id`);--> statement-breakpoint
CREATE INDEX `idx_stu_stop_snapshot` ON `stop_time_updates` (`stop_id`,`snapshot_id`);--> statement-breakpoint
CREATE INDEX `idx_stop_times_trip_seq` ON `stop_times` (`trip_id`,`stop_sequence`);--> statement-breakpoint
CREATE INDEX `idx_stop_times_stop` ON `stop_times` (`stop_id`);--> statement-breakpoint
CREATE INDEX `idx_trip_snapshots_trip_time` ON `trip_update_snapshots` (`trip_id`,`snapshot_time`);--> statement-breakpoint
CREATE INDEX `idx_trip_snapshots_time` ON `trip_update_snapshots` (`snapshot_time`);