CREATE TABLE `alerts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_id` text NOT NULL,
	`cause` integer DEFAULT 1 NOT NULL,
	`effect` integer DEFAULT 8 NOT NULL,
	`severity_level` integer DEFAULT 1,
	`url` text,
	`header_text` text,
	`description_text` text,
	`tts_header_text` text,
	`tts_description_text` text,
	`image` text,
	`image_alternative_text` text,
	`cause_detail` text,
	`effect_detail` text,
	`provider_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `alerts_provider_idx` ON `alerts` (`provider_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `alerts_entity_unique` ON `alerts` (`provider_id`,`entity_id`);--> statement-breakpoint
CREATE TABLE `entities` (
	`snapshot_id` integer NOT NULL,
	`entity_id` text NOT NULL,
	`is_deleted` integer DEFAULT 0 NOT NULL,
	`type` text NOT NULL,
	`trip_update_id` integer,
	`vehicle_position_id` integer,
	`alert_id` integer,
	PRIMARY KEY(`snapshot_id`, `entity_id`)
);
--> statement-breakpoint
CREATE INDEX `entities_snapshot_idx` ON `entities` (`snapshot_id`);--> statement-breakpoint
CREATE TABLE `entity_selectors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`alert_id` integer NOT NULL,
	`agency_id` text,
	`route_id` text,
	`route_type` integer,
	`trip_id` text,
	`direction_id` integer,
	`stop_id` text,
	`provider_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `entity_selectors_alert_idx` ON `entity_selectors` (`alert_id`);--> statement-breakpoint
CREATE INDEX `entity_selectors_provider_idx` ON `entity_selectors` (`provider_id`);--> statement-breakpoint
CREATE TABLE `positions` (
	`provider_id` text NOT NULL,
	`entity_id` text NOT NULL,
	`latitude` text,
	`longitude` text,
	`bearing` integer,
	`odometer` text,
	`speed` text,
	PRIMARY KEY(`provider_id`, `entity_id`)
);
--> statement-breakpoint
CREATE INDEX `positions_provider_idx` ON `positions` (`provider_id`);--> statement-breakpoint
CREATE INDEX `positions_geo_idx` ON `positions` (`latitude`,`longitude`);--> statement-breakpoint
CREATE TABLE `providers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider_id` text NOT NULL,
	`feed_timestamp` integer NOT NULL,
	`gtfs_realtime_version` text NOT NULL,
	`incrementality` integer DEFAULT 0 NOT NULL,
	`feed_version` text,
	`raw_feed` text,
	`entities_count` integer DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX `snapshots_provider_idx` ON `snapshots` (`provider_id`);--> statement-breakpoint
CREATE INDEX `snapshots_timestamp_idx` ON `snapshots` (`feed_timestamp`);--> statement-breakpoint
CREATE UNIQUE INDEX `snapshots_provider_unique` ON `snapshots` (`provider_id`,`feed_timestamp`);--> statement-breakpoint
CREATE TABLE `stop_time_events` (
	`stop_time_update_id` integer NOT NULL,
	`type` integer NOT NULL,
	`delay` integer,
	`time` integer,
	`uncertainty` integer,
	`scheduled_time` integer,
	PRIMARY KEY(`stop_time_update_id`, `type`)
);
--> statement-breakpoint
CREATE TABLE `stop_time_updates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_update_id` integer NOT NULL,
	`stop_sequence` integer,
	`schedule_relationship` integer DEFAULT 0 NOT NULL,
	`departure_occupancy_status` integer,
	`stop_time_properties` text,
	`provider_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `stop_time_updates_trip_idx` ON `stop_time_updates` (`trip_update_id`);--> statement-breakpoint
CREATE INDEX `stop_time_updates_provider_idx` ON `stop_time_updates` (`provider_id`);--> statement-breakpoint
CREATE TABLE `time_ranges` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`alert_id` integer NOT NULL,
	`entity_id` text NOT NULL,
	`start` integer,
	`end` integer,
	`provider_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `time_ranges_alert_idx` ON `time_ranges` (`alert_id`);--> statement-breakpoint
CREATE INDEX `time_ranges_provider_entity_idx` ON `time_ranges` (`provider_id`,`entity_id`);--> statement-breakpoint
CREATE TABLE `translated_strings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`parent_table` text NOT NULL,
	`parent_id` integer NOT NULL,
	`field_name` text NOT NULL,
	`language` text DEFAULT 'en',
	`text` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `translated_strings_parent_idx` ON `translated_strings` (`parent_table`,`parent_id`,`field_name`);--> statement-breakpoint
CREATE TABLE `trip_descriptors` (
	`provider_id` text NOT NULL,
	`trip_id` text NOT NULL,
	`route_id` text,
	`direction_id` integer,
	`schedule_relationship` integer DEFAULT 0 NOT NULL,
	`start_date` text,
	`start_time` text,
	PRIMARY KEY(`provider_id`, `trip_id`)
);
--> statement-breakpoint
CREATE INDEX `trip_descriptors_provider_idx` ON `trip_descriptors` (`provider_id`);--> statement-breakpoint
CREATE TABLE `trip_updates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_id` text NOT NULL,
	`timestamp` integer,
	`delay` integer,
	`trip_properties` text,
	`provider_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `trip_updates_provider_idx` ON `trip_updates` (`provider_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `trip_updates_entity_unique` ON `trip_updates` (`provider_id`,`entity_id`);--> statement-breakpoint
CREATE TABLE `vehicle_descriptors` (
	`provider_id` text NOT NULL,
	`vehicle_id` text NOT NULL,
	`label` text,
	`license_plate` text,
	PRIMARY KEY(`provider_id`, `vehicle_id`)
);
--> statement-breakpoint
CREATE INDEX `vehicle_descriptors_provider_idx` ON `vehicle_descriptors` (`provider_id`);--> statement-breakpoint
CREATE TABLE `vehicle_positions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_id` text NOT NULL,
	`current_stop_sequence` integer,
	`stop_id` text,
	`current_status` integer DEFAULT 2 NOT NULL,
	`timestamp` integer,
	`congestion_level` integer DEFAULT 0,
	`occupancy_status` integer DEFAULT 7,
	`occupancy_percentage` integer,
	`multi_carriage_details` text,
	`provider_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `vehicle_positions_provider_idx` ON `vehicle_positions` (`provider_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `vehicle_positions_entity_unique` ON `vehicle_positions` (`provider_id`,`entity_id`);