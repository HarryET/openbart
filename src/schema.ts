import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
  primaryKey,
} from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

// Base columns for tenancy and auditing (reused via schema inheritance in app code)
const baseColumns = {
  providerId: text("provider_id").notNull(), // e.g., 'bart', 'sfmta'
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(), // Unix seconds
};

// Providers table: Manage tenants
export const providers = sqliteTable("providers", {
  id: text("id").primaryKey(), // providerId as PK
  name: text("name").notNull(), // Human-readable name
});

export const providersRelations = relations(providers, ({ many }) => ({
  snapshots: many(snapshots),
}));

// Snapshots table: One row per cron feed snapshot
export const snapshots = sqliteTable(
  "snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    providerId: text("provider_id").notNull(),
    feedTimestamp: integer("feed_timestamp", { mode: "timestamp" }).notNull(), // From FeedHeader.timestamp
    gtfsRealtimeVersion: text("gtfs_realtime_version").notNull(), // e.g., '2.0'
    incrementality: integer("incrementality").notNull().default(0), // Enum: 0=FULL_DATASET, 1=DIFFERENTIAL
    feedVersion: text("feed_version"), // Optional
    entitiesCount: integer("entities_count").default(0), // Computed: number of entities in this snapshot
    finished: integer("finished", { mode: "boolean" }).notNull().default(false), // 0 = processing, 1 = finished
  },
  (table) => ({
    providerIdx: index("snapshots_provider_idx").on(table.providerId),
    timestampIdx: index("snapshots_timestamp_idx").on(table.feedTimestamp),
    finishedIdx: index("snapshots_finished_idx").on(
      table.providerId,
      table.finished,
    ),
    providerUnique: uniqueIndex("snapshots_provider_unique").on(
      table.providerId,
      table.feedTimestamp,
    ), // One snapshot per provider/minute
  }),
);

export const snapshotsRelations = relations(snapshots, ({ one, many }) => ({
  provider: one(providers, {
    fields: [snapshots.providerId],
    references: [providers.id],
  }),
  entities: many(entities),
}));

// Entities table: Top-level FeedEntity container
export const entities = sqliteTable(
  "entities",
  {
    snapshotId: integer("snapshot_id").notNull(),
    entityId: text("entity_id").notNull(), // From FeedEntity.id
    isDeleted: integer("is_deleted").default(0).notNull(), // bool as 0/1
    type: text("type").notNull(), // 'TRIP_UPDATE', 'VEHICLE_POSITION', 'ALERT', etc.
    // Type-specific FKs (one is non-null based on type)
    tripUpdateId: integer("trip_update_id"),
    vehiclePositionId: integer("vehicle_position_id"),
    alertId: integer("alert_id"),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.snapshotId, table.entityId] }), // Composite PK for uniqueness per snapshot
    snapshotFk: index("entities_snapshot_idx").on(table.snapshotId),
  }),
);

export const entitiesRelations = relations(entities, ({ one }) => ({
  snapshot: one(snapshots, {
    fields: [entities.snapshotId],
    references: [snapshots.id],
  }),
  tripUpdate: one(tripUpdates, {
    fields: [entities.tripUpdateId],
    references: [tripUpdates.id],
  }),
  vehiclePosition: one(vehiclePositions, {
    fields: [entities.vehiclePositionId],
    references: [vehiclePositions.id],
  }),
  alert: one(alerts, {
    fields: [entities.alertId],
    references: [alerts.id],
  }),
}));

// TripUpdates table
export const tripUpdates = sqliteTable(
  "trip_updates",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    entityId: text("entity_id").notNull(), // FK to entities.entity_id
    timestamp: integer("timestamp", { mode: "timestamp" }), // Update generation time
    delay: integer("delay"), // Trip-level delay (seconds)
    tripProperties: text("trip_properties"), // JSON for experimental TripProperties (shape_id, headsign, etc.)
    ...baseColumns,
  },
  (table) => ({
    providerIdx: index("trip_updates_provider_idx").on(table.providerId),
  }),
);

export const tripUpdatesRelations = relations(tripUpdates, ({ many, one }) => ({
  entities: many(entities), // Reverse relation
  trip: one(tripDescriptors, {
    fields: [tripUpdates.providerId, tripUpdates.entityId], // Assuming entityId == trip.trip_id for simplicity
    references: [tripDescriptors.providerId, tripDescriptors.tripId],
  }),
  vehicleDescriptor: one(vehicleDescriptors, {
    fields: [tripUpdates.providerId, tripUpdates.entityId],
    references: [vehicleDescriptors.providerId, vehicleDescriptors.vehicleId],
  }),
  stopTimeUpdates: many(stopTimeUpdates),
}));

// VehiclePositions table
export const vehiclePositions = sqliteTable(
  "vehicle_positions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    entityId: text("entity_id").notNull(),
    currentStopSequence: integer("current_stop_sequence"),
    stopId: text("stop_id"),
    currentStatus: integer("current_status").default(2).notNull(), // Enum: 0=INCOMING_AT, 1=STOPPED_AT, 2=IN_TRANSIT_TO
    timestamp: integer("timestamp", { mode: "timestamp" }),
    congestionLevel: integer("congestion_level").default(0), // Enum: 0=UNKNOWN, 1=RUNNING_SMOOTHLY, etc.
    occupancyStatus: integer("occupancy_status").default(7), // Enum: 0=EMPTY, ..., 7=NO_DATA_AVAILABLE
    occupancyPercentage: integer("occupancy_percentage"), // 0-100 or >100
    multiCarriageDetails: text("multi_carriage_details"), // JSON array for experimental CarriageDetails
    ...baseColumns,
  },
  (table) => ({
    providerIdx: index("vehicle_positions_provider_idx").on(table.providerId),
  }),
);

export const vehiclePositionsRelations = relations(
  vehiclePositions,
  ({ many, one }) => ({
    entities: many(entities),
    trip: one(tripDescriptors, {
      fields: [vehiclePositions.providerId, vehiclePositions.entityId],
      references: [tripDescriptors.providerId, tripDescriptors.tripId],
    }),
    vehicleDescriptor: one(vehicleDescriptors, {
      fields: [vehiclePositions.providerId, vehiclePositions.entityId],
      references: [vehicleDescriptors.providerId, vehicleDescriptors.vehicleId],
    }),
    position: one(positions, {
      fields: [vehiclePositions.providerId, vehiclePositions.entityId],
      references: [positions.providerId, positions.entityId],
    }),
  }),
);

// Alerts table
export const alerts = sqliteTable(
  "alerts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    entityId: text("entity_id").notNull(),
    cause: integer("cause").default(1).notNull(), // Enum: 1=UNKNOWN_CAUSE, 3=TECHNICAL_PROBLEM, etc.
    effect: integer("effect").default(8).notNull(), // Enum: 1=NO_SERVICE, 8=UNKNOWN_EFFECT, etc.
    severityLevel: integer("severity_level").default(1), // Enum: 1=UNKNOWN_SEVERITY, 2=INFO, etc.
    url: text("url"), // JSON for TranslatedString
    headerText: text("header_text"), // JSON for TranslatedString
    descriptionText: text("description_text"), // JSON for TranslatedString
    ttsHeaderText: text("tts_header_text"), // JSON
    ttsDescriptionText: text("tts_description_text"), // JSON
    image: text("image"), // JSON for experimental TranslatedImage
    imageAlternativeText: text("image_alternative_text"), // JSON
    causeDetail: text("cause_detail"), // JSON
    effectDetail: text("effect_detail"), // JSON
    ...baseColumns,
  },
  (table) => ({
    providerIdx: index("alerts_provider_idx").on(table.providerId),
  }),
);

export const alertsRelations = relations(alerts, ({ many }) => ({
  entities: many(entities),
  activePeriods: many(timeRanges), // Via join on providerId/entityId
  informedEntities: many(entitySelectors),
}));

// Supporting Tables

// TripDescriptors (shared across TripUpdate/VehiclePosition)
export const tripDescriptors = sqliteTable(
  "trip_descriptors",
  {
    providerId: text("provider_id").notNull(),
    tripId: text("trip_id").notNull(), // Composite PK
    routeId: text("route_id"),
    directionId: integer("direction_id"),
    scheduleRelationship: integer("schedule_relationship").notNull().default(0), // Enum: 0=SCHEDULED, 1=ADDED, etc.
    startDate: text("start_date"), // YYYYMMDD
    startTime: text("start_time"), // HH:MM:SS (experimental)
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.providerId, table.tripId],
    }),
    providerIdx: index("trip_descriptors_provider_idx").on(table.providerId),
    routeIdx: index("trip_descriptors_route_idx").on(
      table.providerId,
      table.routeId,
    ),
  }),
);

// VehicleDescriptors (shared)
export const vehicleDescriptors = sqliteTable(
  "vehicle_descriptors",
  {
    providerId: text("provider_id").notNull(),
    vehicleId: text("vehicle_id").notNull(), // Composite PK (entityId or unique id)
    label: text("label"),
    licensePlate: text("license_plate"),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.providerId, table.vehicleId],
    }),
    providerIdx: index("vehicle_descriptors_provider_idx").on(table.providerId),
    vehicleIdIdx: index("vehicle_descriptors_vehicle_idx").on(table.vehicleId),
  }),
);

// Positions (for VehiclePosition)
export const positions = sqliteTable(
  "positions",
  {
    providerId: text("provider_id").notNull(),
    entityId: text("entity_id").notNull(), // Composite PK
    latitude: text("latitude"), // Decimal as text for precision
    longitude: text("longitude"),
    bearing: integer("bearing"), // Degrees 0-360
    odometer: text("odometer"), // Meters, as text for precision
    speed: text("speed"), // m/s, as text
  },
  (table) => ({
    pk: primaryKey({ columns: [table.providerId, table.entityId] }),
    providerIdx: index("positions_provider_idx").on(table.providerId),
    geoIdx: index("positions_geo_idx").on(table.latitude, table.longitude),
    entityIdx: index("positions_entity_idx").on(table.entityId),
  }),
);

// StopTimeUpdates (repeated in TripUpdate)
export const stopTimeUpdates = sqliteTable(
  "stop_time_updates",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tripUpdateId: integer("trip_update_id").notNull(), // FK
    stopSequence: integer("stop_sequence"),
    scheduleRelationship: integer("schedule_relationship").default(0).notNull(), // Enum: 0=SCHEDULED, 1=SKIPPED, etc.
    departureOccupancyStatus: integer("departure_occupancy_status"), // Enum from VehiclePosition
    stopTimeProperties: text("stop_time_properties"), // JSON for experimental (assigned_stop_id, headsign, etc.)
    ...baseColumns,
  },
  (table) => ({
    tripFk: index("stop_time_updates_trip_idx").on(table.tripUpdateId),
    providerIdx: index("stop_time_updates_provider_idx").on(table.providerId),
    providerTripSeqIdx: index("stop_time_updates_provider_trip_seq_idx").on(
      table.providerId,
      table.tripUpdateId,
      table.stopSequence,
    ),
  }),
);

export const stopTimeUpdatesRelations = relations(
  stopTimeUpdates,
  ({ one, many }) => ({
    tripUpdate: one(tripUpdates, {
      fields: [stopTimeUpdates.tripUpdateId],
      references: [tripUpdates.id],
    }),
    stopTimeEvents: many(stopTimeEvents),
  }),
);

// StopTimeEvents (arrival/departure, shared)
export const stopTimeEvents = sqliteTable(
  "stop_time_events",
  {
    stopTimeUpdateId: integer("stop_time_update_id").notNull(),
    type: integer("type").notNull(), // 0=arrival, 1=departure (composite PK)
    delay: integer("delay"), // Seconds
    time: integer("time", { mode: "timestamp" }), // Unix timestamp
    uncertainty: integer("uncertainty"), // Seconds
    scheduledTime: integer("scheduled_time", { mode: "timestamp" }), // Experimental
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.stopTimeUpdateId, table.type],
    }),
    stopTimeUpdateIdx: index("stop_time_events_stu_idx").on(
      table.stopTimeUpdateId,
    ),
  }),
);

export const stopTimeEventsRelations = relations(stopTimeEvents, ({ one }) => ({
  stopTimeUpdate: one(stopTimeUpdates, {
    fields: [stopTimeEvents.stopTimeUpdateId],
    references: [stopTimeUpdates.id],
  }),
}));

// TimeRanges (repeated in Alert.active_period)
export const timeRanges = sqliteTable(
  "time_ranges",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    alertId: integer("alert_id").notNull(), // Or providerId/entityId for FK
    entityId: text("entity_id").notNull(),
    start: integer("start", { mode: "timestamp" }),
    end: integer("end", { mode: "timestamp" }),
    ...baseColumns,
  },
  (table) => ({
    alertFk: index("time_ranges_alert_idx").on(table.alertId),
    providerEntityIdx: index("time_ranges_provider_entity_idx").on(
      table.providerId,
      table.entityId,
    ),
  }),
);

// EntitySelectors (repeated in Alert.informed_entity)
export const entitySelectors = sqliteTable(
  "entity_selectors",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    alertId: integer("alert_id").notNull(),
    agencyId: text("agency_id"),
    routeId: text("route_id"),
    routeType: integer("route_type"), // GTFS route_type
    tripId: text("trip_id"),
    directionId: integer("direction_id"),
    stopId: text("stop_id"),
    ...baseColumns,
  },
  (table) => ({
    alertFk: index("entity_selectors_alert_idx").on(table.alertId),
    providerIdx: index("entity_selectors_provider_idx").on(table.providerId),
  }),
);

// TranslatedStrings (generic table for i18n fields; use JSON per field in main tables for simplicity, or normalize if needed)
// For full normalization, create a table like:
export const translatedStrings = sqliteTable(
  "translated_strings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    parentTable: text("parent_table").notNull(), // e.g., 'alerts'
    parentId: integer("parent_id").notNull(),
    fieldName: text("field_name").notNull(), // e.g., 'header_text'
    language: text("language").default("en"), // BCP 47
    text: text("text").notNull(),
  },
  (table) => ({
    parentIdx: index("translated_strings_parent_idx").on(
      table.parentTable,
      table.parentId,
      table.fieldName,
    ),
  }),
);

// GTFS Static Tables (schedule data)

// Routes (lines: Yellow, Orange, Red, etc.)
export const routes = sqliteTable(
  "routes",
  {
    providerId: text("provider_id").notNull(),
    routeId: text("route_id").notNull(), // e.g., "1", "2", "3"
    routeShortName: text("route_short_name"), // e.g., "Yellow-S"
    routeLongName: text("route_long_name"), // e.g., "Antioch to SF Int'l Airport"
    routeType: integer("route_type").notNull(), // 1=subway/metro
    routeColor: text("route_color"), // hex color without #
    routeTextColor: text("route_text_color"),
    routeUrl: text("route_url"),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.providerId, table.routeId] }),
    providerIdx: index("routes_provider_idx").on(table.providerId),
  }),
);

// Stops (stations and platforms)
export const stops = sqliteTable(
  "stops",
  {
    providerId: text("provider_id").notNull(),
    stopId: text("stop_id").notNull(), // e.g., "A10-1"
    stopCode: text("stop_code"),
    stopName: text("stop_name").notNull(), // e.g., "Lake Merritt"
    stopLat: text("stop_lat"), // decimal as text
    stopLon: text("stop_lon"),
    zoneId: text("zone_id"), // e.g., "LAKE"
    parentStation: text("parent_station"),
    platformCode: text("platform_code"), // e.g., "1", "2"
  },
  (table) => ({
    pk: primaryKey({ columns: [table.providerId, table.stopId] }),
    providerIdx: index("stops_provider_idx").on(table.providerId),
    geoIdx: index("stops_geo_idx").on(table.stopLat, table.stopLon),
  }),
);

// Trips (scheduled trips)
export const trips = sqliteTable(
  "trips",
  {
    providerId: text("provider_id").notNull(),
    tripId: text("trip_id").notNull(),
    routeId: text("route_id").notNull(),
    serviceId: text("service_id").notNull(), // calendar reference
    tripHeadsign: text("trip_headsign"), // e.g., "OAK Airport / SF / Daly City"
    directionId: integer("direction_id"), // 0 or 1
    blockId: text("block_id"),
    shapeId: text("shape_id"),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.providerId, table.tripId] }),
    providerIdx: index("trips_provider_idx").on(table.providerId),
    routeIdx: index("trips_route_idx").on(table.providerId, table.routeId),
  }),
);

// Stop Times (scheduled arrival/departure at each stop)
export const stopTimes = sqliteTable(
  "stop_times",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    providerId: text("provider_id").notNull(),
    tripId: text("trip_id").notNull(),
    stopId: text("stop_id").notNull(),
    stopSequence: integer("stop_sequence").notNull(),
    arrivalTime: text("arrival_time"), // HH:MM:SS
    departureTime: text("departure_time"),
    stopHeadsign: text("stop_headsign"),
  },
  (table) => ({
    providerIdx: index("stop_times_provider_idx").on(table.providerId),
    tripIdx: index("stop_times_trip_idx").on(table.providerId, table.tripId),
    stopIdx: index("stop_times_stop_idx").on(table.providerId, table.stopId),
  }),
);

// Calendar (service schedules)
export const calendar = sqliteTable(
  "calendar",
  {
    providerId: text("provider_id").notNull(),
    serviceId: text("service_id").notNull(),
    monday: integer("monday").notNull(), // 0 or 1
    tuesday: integer("tuesday").notNull(),
    wednesday: integer("wednesday").notNull(),
    thursday: integer("thursday").notNull(),
    friday: integer("friday").notNull(),
    saturday: integer("saturday").notNull(),
    sunday: integer("sunday").notNull(),
    startDate: text("start_date").notNull(), // YYYYMMDD
    endDate: text("end_date").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.providerId, table.serviceId] }),
  }),
);

// Export all for schema
export const gtfsRealtimeSchema = {
  providers,
  snapshots,
  entities,
  tripUpdates,
  vehiclePositions,
  alerts,
  tripDescriptors,
  vehicleDescriptors,
  positions,
  stopTimeUpdates,
  stopTimeEvents,
  timeRanges,
  entitySelectors,
  translatedStrings,
  // Static GTFS
  routes,
  stops,
  trips,
  stopTimes,
  calendar,
};
