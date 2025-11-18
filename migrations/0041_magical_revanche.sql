PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider_id` text NOT NULL,
	`feed_timestamp` integer NOT NULL,
	`gtfs_realtime_version` text NOT NULL,
	`incrementality` integer DEFAULT 0 NOT NULL,
	`feed_version` text,
	`entities_count` integer DEFAULT 0,
	`finished` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_snapshots`("id", "provider_id", "feed_timestamp", "gtfs_realtime_version", "incrementality", "feed_version", "entities_count", "finished") SELECT "id", "provider_id", "feed_timestamp", "gtfs_realtime_version", "incrementality", "feed_version", "entities_count", "finished" FROM `snapshots`;--> statement-breakpoint
DROP TABLE `snapshots`;--> statement-breakpoint
ALTER TABLE `__new_snapshots` RENAME TO `snapshots`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `snapshots_provider_idx` ON `snapshots` (`provider_id`);--> statement-breakpoint
CREATE INDEX `snapshots_timestamp_idx` ON `snapshots` (`feed_timestamp`);--> statement-breakpoint
CREATE INDEX `snapshots_finished_idx` ON `snapshots` (`provider_id`,`finished`);--> statement-breakpoint
CREATE UNIQUE INDEX `snapshots_provider_unique` ON `snapshots` (`provider_id`,`feed_timestamp`);