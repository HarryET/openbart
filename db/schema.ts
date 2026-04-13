import {
  pgTable,
  text,
  integer,
  serial,
  timestamp,
  jsonb,
  numeric,
  index,
} from "drizzle-orm/pg-core";

// --- GTFS Static Reference Tables ---

export const agencies = pgTable("agencies", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  url: text("url"),
  timezone: text("timezone"),
  phone: text("phone"),
});

export const routes = pgTable("routes", {
  id: text("id").primaryKey(),
  agencyId: text("agency_id").references(() => agencies.id),
  shortName: text("short_name"),
  longName: text("long_name"),
  type: integer("type"),
  color: text("color"),
  textColor: text("text_color"),
});

export const stops = pgTable("stops", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  lat: numeric("lat"),
  lon: numeric("lon"),
  parentStation: text("parent_station"),
  platformCode: text("platform_code"),
  locationType: integer("location_type"),
});

// --- GTFS Static: Extended Tables ---

export const feedInfo = pgTable("feed_info", {
  id: serial("id").primaryKey(),
  feedVersion: text("feed_version").notNull(),
  feedPublisherName: text("feed_publisher_name"),
  feedPublisherUrl: text("feed_publisher_url"),
  feedLang: text("feed_lang"),
  feedStartDate: text("feed_start_date"),
  feedEndDate: text("feed_end_date"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const trips = pgTable("trips", {
  id: text("id").primaryKey(),
  routeId: text("route_id")
    .notNull()
    .references(() => routes.id),
  serviceId: text("service_id").notNull(),
  tripHeadsign: text("trip_headsign"),
  directionId: integer("direction_id"),
  blockId: text("block_id"),
  shapeId: text("shape_id"),
});

export const stopTimes = pgTable(
  "stop_times",
  {
    id: serial("id").primaryKey(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id),
    stopId: text("stop_id")
      .notNull()
      .references(() => stops.id),
    arrivalTime: text("arrival_time"),
    departureTime: text("departure_time"),
    stopSequence: integer("stop_sequence").notNull(),
    pickupType: integer("pickup_type"),
    dropOffType: integer("drop_off_type"),
  },
  (table) => [
    index("idx_stop_times_trip_seq").on(table.tripId, table.stopSequence),
    index("idx_stop_times_stop").on(table.stopId),
  ],
);

export const calendar = pgTable("calendar", {
  serviceId: text("service_id").primaryKey(),
  monday: integer("monday").notNull(),
  tuesday: integer("tuesday").notNull(),
  wednesday: integer("wednesday").notNull(),
  thursday: integer("thursday").notNull(),
  friday: integer("friday").notNull(),
  saturday: integer("saturday").notNull(),
  sunday: integer("sunday").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
});

export const calendarDates = pgTable("calendar_dates", {
  id: serial("id").primaryKey(),
  serviceId: text("service_id").notNull(),
  date: text("date").notNull(),
  exceptionType: integer("exception_type").notNull(),
});

export const shapes = pgTable(
  "shapes",
  {
    id: serial("id").primaryKey(),
    shapeId: text("shape_id").notNull(),
    shapePtLat: numeric("shape_pt_lat").notNull(),
    shapePtLon: numeric("shape_pt_lon").notNull(),
    shapePtSequence: integer("shape_pt_sequence").notNull(),
    shapeDistTraveled: numeric("shape_dist_traveled"),
  },
  (table) => [
    index("idx_shapes_id_seq").on(table.shapeId, table.shapePtSequence),
  ],
);

export const transfers = pgTable("transfers", {
  id: serial("id").primaryKey(),
  fromStopId: text("from_stop_id").notNull(),
  toStopId: text("to_stop_id").notNull(),
  transferType: integer("transfer_type"),
  minTransferTime: integer("min_transfer_time"),
});

export const gtfsStaticAuditLog = pgTable("gtfs_static_audit_log", {
  id: serial("id").primaryKey(),
  feedVersionOld: text("feed_version_old"),
  feedVersionNew: text("feed_version_new").notNull(),
  tableName: text("table_name").notNull(),
  rowsAdded: integer("rows_added").notNull().default(0),
  rowsRemoved: integer("rows_removed").notNull().default(0),
  rowsModified: integer("rows_modified").notNull().default(0),
  details: jsonb("details"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// --- Trip Update Snapshot Tables ---

export const tripUpdateSnapshots = pgTable(
  "trip_update_snapshots",
  {
    id: serial("id").primaryKey(),
    tripId: text("trip_id").notNull(),
    vehicleLabel: text("vehicle_label"),
    scheduleRelationship: integer("schedule_relationship"),
    feedTimestamp: integer("feed_timestamp"),
    snapshotTime: timestamp("snapshot_time", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_trip_snapshots_trip_time").on(table.tripId, table.snapshotTime),
    index("idx_trip_snapshots_time").on(table.snapshotTime),
  ],
);

export const stopTimeUpdates = pgTable(
  "stop_time_updates",
  {
    id: serial("id").primaryKey(),
    snapshotId: integer("snapshot_id")
      .notNull()
      .references(() => tripUpdateSnapshots.id),
    stopId: text("stop_id").notNull(),
    stopSequence: integer("stop_sequence"),
    arrivalDelay: integer("arrival_delay"),
    arrivalTime: integer("arrival_time"),
    arrivalUncertainty: integer("arrival_uncertainty"),
    departureDelay: integer("departure_delay"),
    departureTime: integer("departure_time"),
    departureUncertainty: integer("departure_uncertainty"),
    scheduleRelationship: integer("schedule_relationship"),
  },
  (table) => [
    index("idx_stu_snapshot").on(table.snapshotId),
    index("idx_stu_stop_snapshot").on(table.stopId, table.snapshotId),
  ],
);

// --- Alert Tables ---

export type ActivePeriod = { start?: number; end?: number };

export const alerts = pgTable("alerts", {
  id: serial("id").primaryKey(),
  feedEntityId: text("feed_entity_id").unique().notNull(),
  headerText: text("header_text"),
  descriptionText: text("description_text"),
  url: text("url"),
  cause: integer("cause"),
  effect: integer("effect"),
  severityLevel: integer("severity_level"),
  activePeriods: jsonb("active_periods").$type<ActivePeriod[]>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const alertInformedEntities = pgTable("alert_informed_entities", {
  id: serial("id").primaryKey(),
  alertId: integer("alert_id")
    .notNull()
    .references(() => alerts.id),
  agencyId: text("agency_id"),
  routeId: text("route_id"),
  stopId: text("stop_id"),
  directionId: integer("direction_id"),
  routeType: integer("route_type"),
  tripId: text("trip_id"),
});

export type InformedEntitySnapshot = {
  agencyId?: string | null;
  routeId?: string | null;
  stopId?: string | null;
  directionId?: number | null;
  routeType?: number | null;
  tripId?: string | null;
};

export const alertVersions = pgTable("alert_versions", {
  id: serial("id").primaryKey(),
  alertId: integer("alert_id")
    .notNull()
    .references(() => alerts.id),
  headerText: text("header_text"),
  descriptionText: text("description_text"),
  url: text("url"),
  cause: integer("cause"),
  effect: integer("effect"),
  severityLevel: integer("severity_level"),
  activePeriods: jsonb("active_periods").$type<ActivePeriod[]>(),
  informedEntities: jsonb("informed_entities").$type<InformedEntitySnapshot[]>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
