import { Hono } from "hono";
import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import { createDb } from "../../../db/client";
import {
  calendar,
  calendarDates,
  stops,
  stopTimes,
  stopTimeUpdates,
  trips,
  tripUpdateSnapshots,
} from "../../../db/schema";
import { errorResponse, parsePagination } from "../lib/response";
import type { AppEnv } from "../app";

export const stopRoutes = new Hono<AppEnv>();

stopRoutes.get("/", async (c) => {
  const db = createDb(c.env);
  const url = new URL(c.req.url);
  const { offset, limit } = parsePagination(url.searchParams);
  const parentOnly = url.searchParams.get("parent_only") === "true";

  const whereClause = parentOnly ? eq(stops.locationType, 1) : undefined;

  const [items, [{ total }]] = await Promise.all([
    db
      .select()
      .from(stops)
      .where(whereClause)
      .orderBy(asc(stops.name))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(stops)
      .where(whereClause),
  ]);

  c.header("Cache-Control", "public, max-age=3600");
  return c.json({ items, pagination: { offset, limit, total } });
});

stopRoutes.get("/:id", async (c) => {
  const db = createDb(c.env);
  const id = c.req.param("id");
  const [row] = await db.select().from(stops).where(eq(stops.id, id)).limit(1);
  if (!row) return errorResponse(c, "NOT_FOUND", `Stop '${id}' not found`);

  let children: typeof row[] = [];
  let parent: typeof row | null = null;

  if (row.locationType === 1) {
    children = await db.select().from(stops).where(eq(stops.parentStation, id));
  } else if (row.parentStation) {
    const [p] = await db
      .select()
      .from(stops)
      .where(eq(stops.id, row.parentStation))
      .limit(1);
    parent = p ?? null;
  }

  c.header("Cache-Control", "public, max-age=3600");
  return c.json({ ...row, children, parent });
});

// GTFS date: YYYYMMDD in agency local time
function todayGtfsDate(): string {
  const tz = "America/Los_Angeles";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  return `${y}${m}${d}`;
}

function nowHms(): string {
  const tz = "America/Los_Angeles";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const h = parts.find((p) => p.type === "hour")!.value;
  const m = parts.find((p) => p.type === "minute")!.value;
  const s = parts.find((p) => p.type === "second")!.value;
  return `${h}:${m}:${s}`;
}

function dayOfWeekColumn(date: string) {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(4, 6)) - 1;
  const d = Number(date.slice(6, 8));
  const dow = new Date(Date.UTC(y, m, d)).getUTCDay();
  return [
    calendar.sunday,
    calendar.monday,
    calendar.tuesday,
    calendar.wednesday,
    calendar.thursday,
    calendar.friday,
    calendar.saturday,
  ][dow];
}

async function activeServiceIds(db: ReturnType<typeof createDb>, date: string) {
  const dowCol = dayOfWeekColumn(date);
  const baseServices = await db
    .select({ serviceId: calendar.serviceId })
    .from(calendar)
    .where(
      and(
        eq(dowCol, 1),
        sql`${calendar.startDate} <= ${date}`,
        sql`${calendar.endDate} >= ${date}`,
      ),
    );
  const exceptions = await db
    .select({ serviceId: calendarDates.serviceId, exceptionType: calendarDates.exceptionType })
    .from(calendarDates)
    .where(eq(calendarDates.date, date));

  const set = new Set(baseServices.map((r) => r.serviceId));
  for (const ex of exceptions) {
    if (ex.exceptionType === 1) set.add(ex.serviceId);
    else if (ex.exceptionType === 2) set.delete(ex.serviceId);
  }
  return Array.from(set);
}

async function resolveStopIds(db: ReturnType<typeof createDb>, stopId: string): Promise<string[]> {
  const [stop] = await db.select().from(stops).where(eq(stops.id, stopId)).limit(1);
  if (!stop) return [];
  if (stop.locationType === 1) {
    const children = await db
      .select({ id: stops.id })
      .from(stops)
      .where(eq(stops.parentStation, stopId));
    return [stopId, ...children.map((c) => c.id)];
  }
  return [stopId];
}

stopRoutes.get("/:id/schedule", async (c) => {
  const db = createDb(c.env);
  const id = c.req.param("id");
  const url = new URL(c.req.url);
  const date = url.searchParams.get("date") ?? todayGtfsDate();
  const routeIdFilter = url.searchParams.get("route_id");

  const stopIds = await resolveStopIds(db, id);
  if (stopIds.length === 0) return errorResponse(c, "NOT_FOUND", `Stop '${id}' not found`);

  const serviceIds = await activeServiceIds(db, date);
  if (serviceIds.length === 0) {
    return c.json({ stopId: id, date, items: [] });
  }

  const conditions = [
    inArray(stopTimes.stopId, stopIds),
    inArray(trips.serviceId, serviceIds),
  ];
  if (routeIdFilter) conditions.push(eq(trips.routeId, routeIdFilter));

  const items = await db
    .select({
      tripId: trips.id,
      routeId: trips.routeId,
      headsign: trips.tripHeadsign,
      directionId: trips.directionId,
      stopId: stopTimes.stopId,
      stopSequence: stopTimes.stopSequence,
      arrivalTime: stopTimes.arrivalTime,
      departureTime: stopTimes.departureTime,
    })
    .from(stopTimes)
    .innerJoin(trips, eq(stopTimes.tripId, trips.id))
    .where(and(...conditions))
    .orderBy(asc(stopTimes.departureTime));

  c.header("Cache-Control", "public, max-age=3600");
  return c.json({ stopId: id, date, items });
});

stopRoutes.get("/:id/departures", async (c) => {
  const db = createDb(c.env);
  const id = c.req.param("id");
  const url = new URL(c.req.url);
  const limitParam = Number(url.searchParams.get("limit") ?? "10");
  const limit = Number.isFinite(limitParam) ? Math.min(50, Math.max(1, Math.floor(limitParam))) : 10;
  const routeIdFilter = url.searchParams.get("route_id");

  const stopIds = await resolveStopIds(db, id);
  if (stopIds.length === 0) return errorResponse(c, "NOT_FOUND", `Stop '${id}' not found`);

  const date = todayGtfsDate();
  const serviceIds = await activeServiceIds(db, date);
  const timeFrom = nowHms();

  if (serviceIds.length === 0) {
    return c.json({ stopId: id, departures: [] });
  }

  const conditions = [
    inArray(stopTimes.stopId, stopIds),
    inArray(trips.serviceId, serviceIds),
    gte(stopTimes.departureTime, timeFrom),
  ];
  if (routeIdFilter) conditions.push(eq(trips.routeId, routeIdFilter));

  const scheduled = await db
    .select({
      tripId: trips.id,
      routeId: trips.routeId,
      headsign: trips.tripHeadsign,
      directionId: trips.directionId,
      stopId: stopTimes.stopId,
      stopSequence: stopTimes.stopSequence,
      arrivalTime: stopTimes.arrivalTime,
      departureTime: stopTimes.departureTime,
    })
    .from(stopTimes)
    .innerJoin(trips, eq(stopTimes.tripId, trips.id))
    .where(and(...conditions))
    .orderBy(asc(stopTimes.departureTime))
    .limit(limit);

  // Overlay latest real-time updates for these trips.
  const tripIds = scheduled.map((s) => s.tripId);
  let realtimeByTrip = new Map<string, { delay: number | null; uncertainty: number | null }>();
  if (tripIds.length > 0) {
    const latestSnapshots = await db
      .select({
        tripId: tripUpdateSnapshots.tripId,
        id: sql<number>`MAX(${tripUpdateSnapshots.id})`.mapWith(Number),
      })
      .from(tripUpdateSnapshots)
      .where(inArray(tripUpdateSnapshots.tripId, tripIds))
      .groupBy(tripUpdateSnapshots.tripId);

    if (latestSnapshots.length > 0) {
      const snapshotIds = latestSnapshots.map((r) => r.id);
      const snapshotToTrip = new Map(latestSnapshots.map((r) => [r.id, r.tripId]));

      const updates = await db
        .select({
          snapshotId: stopTimeUpdates.snapshotId,
          stopId: stopTimeUpdates.stopId,
          arrivalDelay: stopTimeUpdates.arrivalDelay,
          arrivalUncertainty: stopTimeUpdates.arrivalUncertainty,
          departureDelay: stopTimeUpdates.departureDelay,
          departureUncertainty: stopTimeUpdates.departureUncertainty,
        })
        .from(stopTimeUpdates)
        .where(
          and(inArray(stopTimeUpdates.snapshotId, snapshotIds), inArray(stopTimeUpdates.stopId, stopIds)),
        );

      for (const u of updates) {
        const tripId = snapshotToTrip.get(u.snapshotId);
        if (!tripId) continue;
        realtimeByTrip.set(tripId, {
          delay: u.departureDelay ?? u.arrivalDelay ?? null,
          uncertainty: u.departureUncertainty ?? u.arrivalUncertainty ?? null,
        });
      }
    }
  }

  const departures = scheduled.map((s) => ({
    ...s,
    realtime: realtimeByTrip.get(s.tripId) ?? null,
  }));

  c.header("Cache-Control", "public, max-age=30");
  return c.json({ stopId: id, date, departures });
});
