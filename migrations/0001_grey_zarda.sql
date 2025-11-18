CREATE TABLE `calendar` (
	`provider_id` text NOT NULL,
	`service_id` text NOT NULL,
	`monday` integer NOT NULL,
	`tuesday` integer NOT NULL,
	`wednesday` integer NOT NULL,
	`thursday` integer NOT NULL,
	`friday` integer NOT NULL,
	`saturday` integer NOT NULL,
	`sunday` integer NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	PRIMARY KEY(`provider_id`, `service_id`)
);
--> statement-breakpoint
CREATE TABLE `routes` (
	`provider_id` text NOT NULL,
	`route_id` text NOT NULL,
	`route_short_name` text,
	`route_long_name` text,
	`route_type` integer NOT NULL,
	`route_color` text,
	`route_text_color` text,
	`route_url` text,
	PRIMARY KEY(`provider_id`, `route_id`)
);
--> statement-breakpoint
CREATE INDEX `routes_provider_idx` ON `routes` (`provider_id`);--> statement-breakpoint
CREATE TABLE `stop_times` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider_id` text NOT NULL,
	`trip_id` text NOT NULL,
	`stop_id` text NOT NULL,
	`stop_sequence` integer NOT NULL,
	`arrival_time` text,
	`departure_time` text,
	`stop_headsign` text
);
--> statement-breakpoint
CREATE INDEX `stop_times_provider_idx` ON `stop_times` (`provider_id`);--> statement-breakpoint
CREATE INDEX `stop_times_trip_idx` ON `stop_times` (`provider_id`,`trip_id`);--> statement-breakpoint
CREATE INDEX `stop_times_stop_idx` ON `stop_times` (`provider_id`,`stop_id`);--> statement-breakpoint
CREATE TABLE `stops` (
	`provider_id` text NOT NULL,
	`stop_id` text NOT NULL,
	`stop_code` text,
	`stop_name` text NOT NULL,
	`stop_lat` text,
	`stop_lon` text,
	`zone_id` text,
	`parent_station` text,
	`platform_code` text,
	PRIMARY KEY(`provider_id`, `stop_id`)
);
--> statement-breakpoint
CREATE INDEX `stops_provider_idx` ON `stops` (`provider_id`);--> statement-breakpoint
CREATE INDEX `stops_geo_idx` ON `stops` (`stop_lat`,`stop_lon`);--> statement-breakpoint
CREATE TABLE `trips` (
	`provider_id` text NOT NULL,
	`trip_id` text NOT NULL,
	`route_id` text NOT NULL,
	`service_id` text NOT NULL,
	`trip_headsign` text,
	`direction_id` integer,
	`block_id` text,
	`shape_id` text,
	PRIMARY KEY(`provider_id`, `trip_id`)
);
--> statement-breakpoint
CREATE INDEX `trips_provider_idx` ON `trips` (`provider_id`);--> statement-breakpoint
CREATE INDEX `trips_route_idx` ON `trips` (`provider_id`,`route_id`);--> statement-breakpoint
