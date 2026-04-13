import { Hono } from "hono";
import { asc, eq, sql } from "drizzle-orm";
import { createDb } from "../../../db/client";
import {
  routes as routesTable,
  stopTimes,
  stopTimeUpdates,
  trips,
  tripUpdateSnapshots,
} from "../../../db/schema";
import { errorResponse } from "../lib/response";
import type { AppEnv } from "../app";

export const tripRoutes = new Hono<AppEnv>();

tripRoutes.get("/:id", async (c) => {
  const db = createDb(c.env);
  const id = c.req.param("id");
  const [row] = await db
    .select({
      trip: trips,
      route: routesTable,
    })
    .from(trips)
    .leftJoin(routesTable, eq(trips.routeId, routesTable.id))
    .where(eq(trips.id, id))
    .limit(1);

  if (!row) return errorResponse(c, "NOT_FOUND", `Trip '${id}' not found`);
  c.header("Cache-Control", "public, max-age=3600");
  return c.json({ ...row.trip, route: row.route });
});

tripRoutes.get("/:id/stop-times", async (c) => {
  const db = createDb(c.env);
  const id = c.req.param("id");

  const scheduled = await db
    .select()
    .from(stopTimes)
    .where(eq(stopTimes.tripId, id))
    .orderBy(asc(stopTimes.stopSequence));

  if (scheduled.length === 0) return errorResponse(c, "NOT_FOUND", `Trip '${id}' not found`);

  // Latest snapshot for this trip
  const [latest] = await db
    .select({ id: sql<number>`MAX(${tripUpdateSnapshots.id})`.mapWith(Number) })
    .from(tripUpdateSnapshots)
    .where(eq(tripUpdateSnapshots.tripId, id));

  const realtimeByStop = new Map<
    string,
    {
      arrivalDelay: number | null;
      arrivalUncertainty: number | null;
      departureDelay: number | null;
      departureUncertainty: number | null;
    }
  >();

  if (latest?.id) {
    const updates = await db
      .select()
      .from(stopTimeUpdates)
      .where(eq(stopTimeUpdates.snapshotId, latest.id));
    for (const u of updates) {
      realtimeByStop.set(u.stopId, {
        arrivalDelay: u.arrivalDelay,
        arrivalUncertainty: u.arrivalUncertainty,
        departureDelay: u.departureDelay,
        departureUncertainty: u.departureUncertainty,
      });
    }
  }

  const items = scheduled.map((st) => ({
    ...st,
    realtime: realtimeByStop.get(st.stopId) ?? null,
  }));

  c.header("Cache-Control", "public, max-age=30");
  return c.json({ tripId: id, items });
});
