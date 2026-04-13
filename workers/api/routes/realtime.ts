import { Hono } from "hono";
import { and, desc, eq, sql } from "drizzle-orm";
import { createDb } from "../../../db/client";
import {
  stopTimeUpdates,
  trips,
  tripUpdateSnapshots,
} from "../../../db/schema";
import { errorResponse } from "../lib/response";
import type { AppEnv } from "../app";

export const realtimeRoutes = new Hono<AppEnv>();

realtimeRoutes.get("/trip-updates", async (c) => {
  const db = createDb(c.env);
  const url = new URL(c.req.url);
  const routeIdFilter = url.searchParams.get("route_id");
  const tripIdFilter = url.searchParams.get("trip_id");

  // Latest snapshot per trip_id
  const latestPerTrip = db.$with("latest_per_trip").as(
    db
      .select({
        tripId: tripUpdateSnapshots.tripId,
        id: sql<number>`MAX(${tripUpdateSnapshots.id})`.as("id"),
      })
      .from(tripUpdateSnapshots)
      .groupBy(tripUpdateSnapshots.tripId),
  );

  const conditions = [];
  if (tripIdFilter) conditions.push(eq(tripUpdateSnapshots.tripId, tripIdFilter));
  if (routeIdFilter) conditions.push(eq(trips.routeId, routeIdFilter));

  const snapshots = await db
    .with(latestPerTrip)
    .select({
      id: tripUpdateSnapshots.id,
      tripId: tripUpdateSnapshots.tripId,
      routeId: trips.routeId,
      vehicleLabel: tripUpdateSnapshots.vehicleLabel,
      scheduleRelationship: tripUpdateSnapshots.scheduleRelationship,
      feedTimestamp: tripUpdateSnapshots.feedTimestamp,
      snapshotTime: tripUpdateSnapshots.snapshotTime,
    })
    .from(tripUpdateSnapshots)
    .innerJoin(
      latestPerTrip,
      and(
        eq(latestPerTrip.tripId, tripUpdateSnapshots.tripId),
        eq(latestPerTrip.id, tripUpdateSnapshots.id),
      ),
    )
    .leftJoin(trips, eq(trips.id, tripUpdateSnapshots.tripId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(tripUpdateSnapshots.snapshotTime))
    .limit(500);

  c.header("Cache-Control", "public, max-age=30");
  return c.json({
    items: snapshots,
    pagination: { offset: 0, limit: snapshots.length, total: snapshots.length },
  });
});

realtimeRoutes.get("/trip-updates/:tripId", async (c) => {
  const db = createDb(c.env);
  const tripId = c.req.param("tripId");

  const [snapshot] = await db
    .select()
    .from(tripUpdateSnapshots)
    .where(eq(tripUpdateSnapshots.tripId, tripId))
    .orderBy(desc(tripUpdateSnapshots.id))
    .limit(1);

  if (!snapshot) {
    return errorResponse(c, "NOT_FOUND", `No real-time updates for trip '${tripId}'`);
  }

  const updates = await db
    .select()
    .from(stopTimeUpdates)
    .where(eq(stopTimeUpdates.snapshotId, snapshot.id));

  c.header("Cache-Control", "public, max-age=30");
  return c.json({ ...snapshot, stopTimeUpdates: updates });
});

realtimeRoutes.get("/stops/:stopId", async (c) => {
  const db = createDb(c.env);
  const stopId = c.req.param("stopId");

  // Get the latest snapshot per trip, then filter stop_time_updates by stop_id
  const latestPerTrip = db.$with("latest_per_trip").as(
    db
      .select({
        tripId: tripUpdateSnapshots.tripId,
        id: sql<number>`MAX(${tripUpdateSnapshots.id})`.as("id"),
      })
      .from(tripUpdateSnapshots)
      .groupBy(tripUpdateSnapshots.tripId),
  );

  const rows = await db
    .with(latestPerTrip)
    .select({
      snapshotId: tripUpdateSnapshots.id,
      tripId: tripUpdateSnapshots.tripId,
      routeId: trips.routeId,
      snapshotTime: tripUpdateSnapshots.snapshotTime,
      stopId: stopTimeUpdates.stopId,
      stopSequence: stopTimeUpdates.stopSequence,
      arrivalDelay: stopTimeUpdates.arrivalDelay,
      arrivalTime: stopTimeUpdates.arrivalTime,
      arrivalUncertainty: stopTimeUpdates.arrivalUncertainty,
      departureDelay: stopTimeUpdates.departureDelay,
      departureTime: stopTimeUpdates.departureTime,
      departureUncertainty: stopTimeUpdates.departureUncertainty,
      scheduleRelationship: stopTimeUpdates.scheduleRelationship,
    })
    .from(stopTimeUpdates)
    .innerJoin(tripUpdateSnapshots, eq(stopTimeUpdates.snapshotId, tripUpdateSnapshots.id))
    .innerJoin(
      latestPerTrip,
      and(
        eq(latestPerTrip.tripId, tripUpdateSnapshots.tripId),
        eq(latestPerTrip.id, tripUpdateSnapshots.id),
      ),
    )
    .leftJoin(trips, eq(trips.id, tripUpdateSnapshots.tripId))
    .where(eq(stopTimeUpdates.stopId, stopId))
    .orderBy(desc(tripUpdateSnapshots.snapshotTime))
    .limit(500);

  c.header("Cache-Control", "public, max-age=30");
  return c.json({
    stopId,
    items: rows,
    pagination: { offset: 0, limit: rows.length, total: rows.length },
  });
});
