ALTER TABLE `snapshots` ADD `finished` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `snapshots_finished_idx` ON `snapshots` (`provider_id`,`finished`);