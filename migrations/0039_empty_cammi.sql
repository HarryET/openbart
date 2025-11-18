CREATE INDEX `positions_entity_idx` ON `positions` (`entity_id`);--> statement-breakpoint
CREATE INDEX `stop_time_events_stu_idx` ON `stop_time_events` (`stop_time_update_id`);--> statement-breakpoint
CREATE INDEX `stop_time_updates_provider_trip_seq_idx` ON `stop_time_updates` (`provider_id`,`trip_update_id`,`stop_sequence`);--> statement-breakpoint
CREATE INDEX `trip_descriptors_route_idx` ON `trip_descriptors` (`provider_id`,`route_id`);--> statement-breakpoint
CREATE INDEX `vehicle_descriptors_vehicle_idx` ON `vehicle_descriptors` (`vehicle_id`);