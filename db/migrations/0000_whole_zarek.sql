CREATE TABLE "agencies" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"url" text,
	"timezone" text,
	"phone" text
);
--> statement-breakpoint
CREATE TABLE "alert_informed_entities" (
	"id" serial PRIMARY KEY NOT NULL,
	"alert_id" integer NOT NULL,
	"agency_id" text,
	"route_id" text,
	"stop_id" text,
	"direction_id" integer,
	"route_type" integer,
	"trip_id" text
);
--> statement-breakpoint
CREATE TABLE "alert_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"alert_id" integer NOT NULL,
	"header_text" text,
	"description_text" text,
	"url" text,
	"cause" integer,
	"effect" integer,
	"severity_level" integer,
	"active_periods" jsonb,
	"informed_entities" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"feed_entity_id" text NOT NULL,
	"header_text" text,
	"description_text" text,
	"url" text,
	"cause" integer,
	"effect" integer,
	"severity_level" integer,
	"active_periods" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "alerts_feed_entity_id_unique" UNIQUE("feed_entity_id")
);
--> statement-breakpoint
CREATE TABLE "routes" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text,
	"short_name" text,
	"long_name" text,
	"type" integer,
	"color" text,
	"text_color" text
);
--> statement-breakpoint
CREATE TABLE "stops" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"lat" numeric,
	"lon" numeric,
	"parent_station" text,
	"platform_code" text,
	"location_type" integer
);
--> statement-breakpoint
ALTER TABLE "alert_informed_entities" ADD CONSTRAINT "alert_informed_entities_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_versions" ADD CONSTRAINT "alert_versions_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routes" ADD CONSTRAINT "routes_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;