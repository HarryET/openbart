import {
  mysqlTable,
  varchar,
  text,
  int,
  timestamp,
  json,
  decimal,
  index,
} from "drizzle-orm/mysql-core";

// --- GTFS Static Reference Tables ---

export const agencies = mysqlTable("agencies", {
  id: varchar("id", { length: 255 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  url: text("url"),
  timezone: varchar("timezone", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
});

export const routes = mysqlTable("routes", {
  id: varchar("id", { length: 255 }).primaryKey(),
  agencyId: varchar("agency_id", { length: 255 }),
  shortName: varchar("short_name", { length: 255 }),
  longName: text("long_name"),
  type: int("type"),
  color: varchar("color", { length: 20 }),
  textColor: varchar("text_color", { length: 20 }),
});

export const stops = mysqlTable("stops", {
  id: varchar("id", { length: 255 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  lat: decimal("lat", { precision: 12, scale: 8 }),
  lon: decimal("lon", { precision: 12, scale: 8 }),
  parentStation: varchar("parent_station", { length: 255 }),
  platformCode: varchar("platform_code", { length: 20 }),
  locationType: int("location_type"),
});

// --- GTFS Static: Extended Tables ---

export const feedInfo = mysqlTable("feed_info", {
  id: int("id").autoincrement().primaryKey(),
  feedVersion: varchar("feed_version", { length: 255 }).notNull(),
  feedPublisherName: text("feed_publisher_name"),
  feedPublisherUrl: text("feed_publisher_url"),
  feedLang: varchar("feed_lang", { length: 10 }),
  feedStartDate: varchar("feed_start_date", { length: 8 }),
  feedEndDate: varchar("feed_end_date", { length: 8 }),
  fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
});

export const trips = mysqlTable("trips", {
  id: varchar("id", { length: 255 }).primaryKey(),
  routeId: varchar("route_id", { length: 255 }).notNull(),
  serviceId: varchar("service_id", { length: 255 }).notNull(),
  tripHeadsign: text("trip_headsign"),
  directionId: int("direction_id"),
  blockId: varchar("block_id", { length: 255 }),
  shapeId: varchar("shape_id", { length: 255 }),
});

export const stopTimes = mysqlTable(
  "stop_times",
  {
    id: int("id").autoincrement().primaryKey(),
    tripId: varchar("trip_id", { length: 255 }).notNull(),
    stopId: varchar("stop_id", { length: 255 }).notNull(),
    arrivalTime: varchar("arrival_time", { length: 10 }),
    departureTime: varchar("departure_time", { length: 10 }),
    stopSequence: int("stop_sequence").notNull(),
    pickupType: int("pickup_type"),
    dropOffType: int("drop_off_type"),
  },
  (table) => [
    index("idx_stop_times_trip_seq").on(table.tripId, table.stopSequence),
    index("idx_stop_times_stop").on(table.stopId),
  ],
);

export const calendar = mysqlTable("calendar", {
  serviceId: varchar("service_id", { length: 255 }).primaryKey(),
  monday: int("monday").notNull(),
  tuesday: int("tuesday").notNull(),
  wednesday: int("wednesday").notNull(),
  thursday: int("thursday").notNull(),
  friday: int("friday").notNull(),
  saturday: int("saturday").notNull(),
  sunday: int("sunday").notNull(),
  startDate: varchar("start_date", { length: 8 }).notNull(),
  endDate: varchar("end_date", { length: 8 }).notNull(),
});

export const calendarDates = mysqlTable("calendar_dates", {
  id: int("id").autoincrement().primaryKey(),
  serviceId: varchar("service_id", { length: 255 }).notNull(),
  date: varchar("date", { length: 8 }).notNull(),
  exceptionType: int("exception_type").notNull(),
});

export const shapes = mysqlTable(
  "shapes",
  {
    id: int("id").autoincrement().primaryKey(),
    shapeId: varchar("shape_id", { length: 255 }).notNull(),
    shapePtLat: decimal("shape_pt_lat", { precision: 12, scale: 8 }).notNull(),
    shapePtLon: decimal("shape_pt_lon", { precision: 12, scale: 8 }).notNull(),
    shapePtSequence: int("shape_pt_sequence").notNull(),
    shapeDistTraveled: decimal("shape_dist_traveled", {
      precision: 12,
      scale: 4,
    }),
  },
  (table) => [
    index("idx_shapes_id_seq").on(table.shapeId, table.shapePtSequence),
  ],
);

export const transfers = mysqlTable("transfers", {
  id: int("id").autoincrement().primaryKey(),
  fromStopId: varchar("from_stop_id", { length: 255 }).notNull(),
  toStopId: varchar("to_stop_id", { length: 255 }).notNull(),
  transferType: int("transfer_type"),
  minTransferTime: int("min_transfer_time"),
});

export const gtfsStaticAuditLog = mysqlTable("gtfs_static_audit_log", {
  id: int("id").autoincrement().primaryKey(),
  feedVersionOld: varchar("feed_version_old", { length: 255 }),
  feedVersionNew: varchar("feed_version_new", { length: 255 }).notNull(),
  tableName: varchar("table_name", { length: 255 }).notNull(),
  rowsAdded: int("rows_added").notNull().default(0),
  rowsRemoved: int("rows_removed").notNull().default(0),
  rowsModified: int("rows_modified").notNull().default(0),
  details: json("details"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// --- Trip Update Snapshot Tables ---

export const tripUpdateSnapshots = mysqlTable(
  "trip_update_snapshots",
  {
    id: int("id").autoincrement().primaryKey(),
    tripId: varchar("trip_id", { length: 255 }).notNull(),
    vehicleLabel: varchar("vehicle_label", { length: 50 }),
    scheduleRelationship: int("schedule_relationship"),
    feedTimestamp: int("feed_timestamp"),
    snapshotTime: timestamp("snapshot_time").notNull().defaultNow(),
  },
  (table) => [
    index("idx_trip_snapshots_trip_time").on(table.tripId, table.snapshotTime),
    index("idx_trip_snapshots_time").on(table.snapshotTime),
  ],
);

export const stopTimeUpdates = mysqlTable(
  "stop_time_updates",
  {
    id: int("id").autoincrement().primaryKey(),
    snapshotId: int("snapshot_id").notNull(),
    stopId: varchar("stop_id", { length: 255 }).notNull(),
    stopSequence: int("stop_sequence"),
    arrivalDelay: int("arrival_delay"),
    arrivalTime: int("arrival_time"),
    arrivalUncertainty: int("arrival_uncertainty"),
    departureDelay: int("departure_delay"),
    departureTime: int("departure_time"),
    departureUncertainty: int("departure_uncertainty"),
    scheduleRelationship: int("schedule_relationship"),
  },
  (table) => [
    index("idx_stu_snapshot").on(table.snapshotId),
    index("idx_stu_stop_snapshot").on(table.stopId, table.snapshotId),
  ],
);

// --- Alert Tables ---

export type ActivePeriod = { start?: number; end?: number };

export const alerts = mysqlTable("alerts", {
  id: int("id").autoincrement().primaryKey(),
  feedEntityId: varchar("feed_entity_id", { length: 255 }).unique().notNull(),
  headerText: text("header_text"),
  descriptionText: text("description_text"),
  url: text("url"),
  cause: int("cause"),
  effect: int("effect"),
  severityLevel: int("severity_level"),
  activePeriods: json("active_periods").$type<ActivePeriod[]>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

export const alertInformedEntities = mysqlTable("alert_informed_entities", {
  id: int("id").autoincrement().primaryKey(),
  alertId: int("alert_id").notNull(),
  agencyId: varchar("agency_id", { length: 255 }),
  routeId: varchar("route_id", { length: 255 }),
  stopId: varchar("stop_id", { length: 255 }),
  directionId: int("direction_id"),
  routeType: int("route_type"),
  tripId: varchar("trip_id", { length: 255 }),
});

export type InformedEntitySnapshot = {
  agencyId?: string | null;
  routeId?: string | null;
  stopId?: string | null;
  directionId?: number | null;
  routeType?: number | null;
  tripId?: string | null;
};

export const alertVersions = mysqlTable("alert_versions", {
  id: int("id").autoincrement().primaryKey(),
  alertId: int("alert_id").notNull(),
  headerText: text("header_text"),
  descriptionText: text("description_text"),
  url: text("url"),
  cause: int("cause"),
  effect: int("effect"),
  severityLevel: int("severity_level"),
  activePeriods: json("active_periods").$type<ActivePeriod[]>(),
  informedEntities: json("informed_entities").$type<InformedEntitySnapshot[]>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// --- Status Rollup Tables ---

// Hourly rollup of per-line on-time performance and delay metrics.
// Populated by the per-minute cron (recomputes the current hour idempotently).
// Read by /api/v1/status/* to render uptime bars and nines of reliability.
export const lineStatusHourly = mysqlTable(
  "line_status_hourly",
  {
    id: int("id").autoincrement().primaryKey(),
    routeColor: varchar("route_color", { length: 20 }).notNull(),
    hour: timestamp("hour").notNull(),
    totalStops: int("total_stops").notNull().default(0),
    delaySum: int("delay_sum").notNull().default(0),
    onTimeCount: int("on_time_count").notNull().default(0),
    maxDelay: int("max_delay").notNull().default(0),
    snapshotCount: int("snapshot_count").notNull().default(0),
  },
  (table) => [
    index("idx_lsh_color_hour").on(table.routeColor, table.hour),
    index("idx_lsh_hour").on(table.hour),
  ],
);

// --- API Keys ---

export const apiKeys = mysqlTable(
  "api_keys",
  {
    id: int("id").autoincrement().primaryKey(),
    keyHash: varchar("key_hash", { length: 64 }).notNull().unique(),
    keyPrefix: varchar("key_prefix", { length: 12 }).notNull(),
    ownerName: varchar("owner_name", { length: 255 }).notNull(),
    ownerEmail: varchar("owner_email", { length: 255 }),
    rateLimitPerMinute: int("rate_limit_per_minute").notNull().default(300),
    isActive: int("is_active").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at"),
  },
  (table) => [index("idx_api_keys_hash").on(table.keyHash)],
);

export type ApiKeyRow = typeof apiKeys.$inferSelect;
