CREATE TABLE "calendar" (
	"service_id" text PRIMARY KEY NOT NULL,
	"monday" integer NOT NULL,
	"tuesday" integer NOT NULL,
	"wednesday" integer NOT NULL,
	"thursday" integer NOT NULL,
	"friday" integer NOT NULL,
	"saturday" integer NOT NULL,
	"sunday" integer NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_dates" (
	"id" serial PRIMARY KEY NOT NULL,
	"service_id" text NOT NULL,
	"date" text NOT NULL,
	"exception_type" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feed_info" (
	"id" serial PRIMARY KEY NOT NULL,
	"feed_version" text NOT NULL,
	"feed_publisher_name" text,
	"feed_publisher_url" text,
	"feed_lang" text,
	"feed_start_date" text,
	"feed_end_date" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gtfs_static_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"feed_version_old" text,
	"feed_version_new" text NOT NULL,
	"table_name" text NOT NULL,
	"rows_added" integer DEFAULT 0 NOT NULL,
	"rows_removed" integer DEFAULT 0 NOT NULL,
	"rows_modified" integer DEFAULT 0 NOT NULL,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shapes" (
	"id" serial PRIMARY KEY NOT NULL,
	"shape_id" text NOT NULL,
	"shape_pt_lat" numeric NOT NULL,
	"shape_pt_lon" numeric NOT NULL,
	"shape_pt_sequence" integer NOT NULL,
	"shape_dist_traveled" numeric
);
--> statement-breakpoint
CREATE TABLE "stop_time_updates" (
	"id" serial PRIMARY KEY NOT NULL,
	"snapshot_id" integer NOT NULL,
	"stop_id" text NOT NULL,
	"stop_sequence" integer,
	"arrival_delay" integer,
	"arrival_time" integer,
	"arrival_uncertainty" integer,
	"departure_delay" integer,
	"departure_time" integer,
	"departure_uncertainty" integer,
	"schedule_relationship" integer
);
--> statement-breakpoint
CREATE TABLE "stop_times" (
	"id" serial PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"stop_id" text NOT NULL,
	"arrival_time" text,
	"departure_time" text,
	"stop_sequence" integer NOT NULL,
	"pickup_type" integer,
	"drop_off_type" integer
);
--> statement-breakpoint
CREATE TABLE "transfers" (
	"id" serial PRIMARY KEY NOT NULL,
	"from_stop_id" text NOT NULL,
	"to_stop_id" text NOT NULL,
	"transfer_type" integer,
	"min_transfer_time" integer
);
--> statement-breakpoint
CREATE TABLE "trip_update_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"vehicle_label" text,
	"schedule_relationship" integer,
	"feed_timestamp" integer,
	"snapshot_time" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" text PRIMARY KEY NOT NULL,
	"route_id" text NOT NULL,
	"service_id" text NOT NULL,
	"trip_headsign" text,
	"direction_id" integer,
	"block_id" text,
	"shape_id" text
);
--> statement-breakpoint
ALTER TABLE "stop_time_updates" ADD CONSTRAINT "stop_time_updates_snapshot_id_trip_update_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."trip_update_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stop_times" ADD CONSTRAINT "stop_times_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stop_times" ADD CONSTRAINT "stop_times_stop_id_stops_id_fk" FOREIGN KEY ("stop_id") REFERENCES "public"."stops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_shapes_id_seq" ON "shapes" USING btree ("shape_id","shape_pt_sequence");--> statement-breakpoint
CREATE INDEX "idx_stu_snapshot" ON "stop_time_updates" USING btree ("snapshot_id");--> statement-breakpoint
CREATE INDEX "idx_stu_stop_snapshot" ON "stop_time_updates" USING btree ("stop_id","snapshot_id");--> statement-breakpoint
CREATE INDEX "idx_stop_times_trip_seq" ON "stop_times" USING btree ("trip_id","stop_sequence");--> statement-breakpoint
CREATE INDEX "idx_stop_times_stop" ON "stop_times" USING btree ("stop_id");--> statement-breakpoint
CREATE INDEX "idx_trip_snapshots_trip_time" ON "trip_update_snapshots" USING btree ("trip_id","snapshot_time");--> statement-breakpoint
CREATE INDEX "idx_trip_snapshots_time" ON "trip_update_snapshots" USING btree ("snapshot_time");