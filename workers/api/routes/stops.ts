import { Hono } from "hono";
import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import { createDb } from "../../../db/client";
import {
  calendar,
  calendarDates,
  routes as routesTable,
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

// GTFS times can exceed 24:00:00 (e.g. "25:30:00" for trips that started
// before midnight). We convert "HH:MM:SS" (possibly >24h) into a unix
// timestamp for the given GTFS date in agency-local time.
function gtfsTimeToUnix(date: string, hms: string): number {
  const [h, m, s] = hms.split(":").map((x) => Number(x));
  const y = Number(date.slice(0, 4));
  const mo = Number(date.slice(4, 6));
  const d = Number(date.slice(6, 8));
  // Construct a Date representing midnight Pacific local time, then add the seconds.
  // Intl.DateTimeFormat gives us the UTC offset for America/Los_Angeles on that date.
  const tz = "America/Los_Angeles";
  const probe = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "shortOffset",
  }).formatToParts(probe);
  const offsetPart = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT-8";
  const match = /GMT([+-]\d{1,2})(?::?(\d{2}))?/.exec(offsetPart);
  const offsetHours = match ? Number(match[1]) : -8;
  const offsetMinutes = match?.[2] ? Number(match[2]) : 0;
  const offsetSec = offsetHours * 3600 + Math.sign(offsetHours || 1) * offsetMinutes * 60;
  const midnightUtcMs = Date.UTC(y, mo - 1, d) - offsetSec * 1000;
  return Math.floor(midnightUtcMs / 1000) + h * 3600 + m * 60 + s;
}

type ScheduledRow = {
  tripId: string;
  routeId: string;
  headsign: string | null;
  directionId: number | null;
  stopId: string;
  stopSequence: number;
  arrivalTime: string | null;
  departureTime: string | null;
};

type RouteLite = {
  id: string;
  shortName: string | null;
  longName: string | null;
  color: string | null;
  textColor: string | null;
};

type RealtimePoint = {
  delay: number | null;
  uncertainty: number | null;
  arrivalDelay: number | null;
  departureDelay: number | null;
};

// Fetch the latest stop_time_update per (trip, platform) for a set of trips
// filtered to the given platform IDs. Returns a map keyed by `${tripId}|${stopId}`.
async function fetchRealtimeForTripsAtStops(
  db: ReturnType<typeof createDb>,
  tripIds: string[],
  platformIds: string[],
) {
  const realtimeByTripStop = new Map<string, RealtimePoint>();
  if (tripIds.length === 0) return realtimeByTripStop;

  const latestSnapshots = await db
    .select({
      tripId: tripUpdateSnapshots.tripId,
      id: sql<number>`MAX(${tripUpdateSnapshots.id})`.mapWith(Number),
    })
    .from(tripUpdateSnapshots)
    .where(inArray(tripUpdateSnapshots.tripId, tripIds))
    .groupBy(tripUpdateSnapshots.tripId);
  if (latestSnapshots.length === 0) return realtimeByTripStop;

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
      and(
        inArray(stopTimeUpdates.snapshotId, snapshotIds),
        inArray(stopTimeUpdates.stopId, platformIds),
      ),
    );

  for (const u of updates) {
    const tripId = snapshotToTrip.get(u.snapshotId);
    if (!tripId) continue;
    realtimeByTripStop.set(`${tripId}|${u.stopId}`, {
      delay: u.departureDelay ?? u.arrivalDelay ?? null,
      uncertainty: u.departureUncertainty ?? u.arrivalUncertainty ?? null,
      arrivalDelay: u.arrivalDelay,
      departureDelay: u.departureDelay,
    });
  }
  return realtimeByTripStop;
}

// Fetch route metadata for a set of route IDs. Returns a map by id.
async function fetchRoutesByIds(
  db: ReturnType<typeof createDb>,
  ids: string[],
): Promise<Map<string, RouteLite>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({
      id: routesTable.id,
      shortName: routesTable.shortName,
      longName: routesTable.longName,
      color: routesTable.color,
      textColor: routesTable.textColor,
    })
    .from(routesTable)
    .where(inArray(routesTable.id, ids));
  return new Map(rows.map((r) => [r.id, r]));
}

// Fetch platform_code for a set of stop (platform) ids. Returns a map by id.
async function fetchPlatformCodes(
  db: ReturnType<typeof createDb>,
  ids: string[],
): Promise<Map<string, string | null>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: stops.id, platformCode: stops.platformCode })
    .from(stops)
    .where(inArray(stops.id, ids));
  return new Map(rows.map((r) => [r.id, r.platformCode]));
}

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
    return c.json({ stopId: id, date, departures: [] });
  }

  const conditions = [
    inArray(stopTimes.stopId, stopIds),
    inArray(trips.serviceId, serviceIds),
    gte(stopTimes.departureTime, timeFrom),
  ];
  if (routeIdFilter) conditions.push(eq(trips.routeId, routeIdFilter));

  const scheduled: ScheduledRow[] = await db
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

  const tripIds = Array.from(new Set(scheduled.map((s) => s.tripId)));
  const routeIds = Array.from(new Set(scheduled.map((s) => s.routeId)));
  const platformIdsSeen = Array.from(new Set(scheduled.map((s) => s.stopId)));

  const [realtimeByTripStop, routeMap, platformMap] = await Promise.all([
    fetchRealtimeForTripsAtStops(db, tripIds, stopIds),
    fetchRoutesByIds(db, routeIds),
    fetchPlatformCodes(db, platformIdsSeen),
  ]);

  const departures = scheduled.map((s) => {
    const rt = realtimeByTripStop.get(`${s.tripId}|${s.stopId}`) ?? null;
    const delay = rt ? rt.delay : null;
    const predictedDepartureUnix =
      s.departureTime && delay !== null
        ? gtfsTimeToUnix(date, s.departureTime) + delay
        : s.departureTime
        ? gtfsTimeToUnix(date, s.departureTime)
        : null;
    return {
      tripId: s.tripId,
      routeId: s.routeId,
      route: routeMap.get(s.routeId) ?? null,
      headsign: s.headsign,
      directionId: s.directionId,
      stopId: s.stopId,
      platformCode: platformMap.get(s.stopId) ?? null,
      stopSequence: s.stopSequence,
      arrivalTime: s.arrivalTime,
      departureTime: s.departureTime,
      realtime: rt
        ? {
            delay: rt.delay,
            uncertainty: rt.uncertainty,
            predictedDepartureUnix,
          }
        : null,
    };
  });

  c.header("Cache-Control", "public, max-age=30");
  return c.json({ stopId: id, date, departures });
});

stopRoutes.get("/:id/arrivals", async (c) => {
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
    return c.json({ stopId: id, date, arrivals: [] });
  }

  const conditions = [
    inArray(stopTimes.stopId, stopIds),
    inArray(trips.serviceId, serviceIds),
    gte(stopTimes.arrivalTime, timeFrom),
  ];
  if (routeIdFilter) conditions.push(eq(trips.routeId, routeIdFilter));

  const scheduled: ScheduledRow[] = await db
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
    .orderBy(asc(stopTimes.arrivalTime))
    .limit(limit);

  const tripIds = Array.from(new Set(scheduled.map((s) => s.tripId)));
  const routeIds = Array.from(new Set(scheduled.map((s) => s.routeId)));
  const platformIdsSeen = Array.from(new Set(scheduled.map((s) => s.stopId)));

  const [realtimeByTripStop, routeMap, platformMap] = await Promise.all([
    fetchRealtimeForTripsAtStops(db, tripIds, stopIds),
    fetchRoutesByIds(db, routeIds),
    fetchPlatformCodes(db, platformIdsSeen),
  ]);

  const arrivals = scheduled.map((s) => {
    const rt = realtimeByTripStop.get(`${s.tripId}|${s.stopId}`) ?? null;
    // For arrivals, prefer arrival_delay, fall back to departure_delay.
    const delay =
      rt == null ? null : rt.arrivalDelay ?? rt.departureDelay ?? null;
    const predictedArrivalUnix =
      s.arrivalTime && delay !== null
        ? gtfsTimeToUnix(date, s.arrivalTime) + delay
        : s.arrivalTime
        ? gtfsTimeToUnix(date, s.arrivalTime)
        : null;
    return {
      tripId: s.tripId,
      routeId: s.routeId,
      route: routeMap.get(s.routeId) ?? null,
      headsign: s.headsign,
      directionId: s.directionId,
      stopId: s.stopId,
      platformCode: platformMap.get(s.stopId) ?? null,
      stopSequence: s.stopSequence,
      arrivalTime: s.arrivalTime,
      departureTime: s.departureTime,
      realtime: rt
        ? {
            delay,
            uncertainty: rt.uncertainty,
            predictedArrivalUnix,
          }
        : null,
    };
  });

  c.header("Cache-Control", "public, max-age=30");
  return c.json({ stopId: id, date, arrivals });
});

// Station-level on-time performance over a recent window (1–30 days, default 7).
// Computed on demand from raw stop_time_updates using idx_stu_stop_snapshot.
stopRoutes.get("/:id/history", async (c) => {
  const db = createDb(c.env);
  const id = c.req.param("id");
  const url = new URL(c.req.url);
  const rawDays = Number(url.searchParams.get("days") ?? "7");
  const days =
    Number.isFinite(rawDays) && rawDays >= 1 && rawDays <= 30
      ? Math.floor(rawDays)
      : 7;

  const stopIds = await resolveStopIds(db, id);
  if (stopIds.length === 0) return errorResponse(c, "NOT_FOUND", `Stop '${id}' not found`);

  const [rows] = (await db.execute(sql`
    SELECT
      COUNT(*) AS total_samples,
      SUM(CASE WHEN stu.arrival_delay <= 60 THEN 1 ELSE 0 END) AS on_time_count,
      ROUND(AVG(stu.arrival_delay)) AS avg_delay_sec,
      MAX(stu.arrival_delay) AS worst_delay_sec,
      SUM(CASE WHEN stu.arrival_delay > 600 THEN 1 ELSE 0 END) AS major_delay_count
    FROM stop_time_updates stu
    JOIN trip_update_snapshots snap ON snap.id = stu.snapshot_id
    WHERE stu.stop_id IN (${sql.raw(stopIds.map((s) => `'${s.replace(/'/g, "''")}'`).join(","))})
      AND snap.snapshot_time > NOW() - INTERVAL ${sql.raw(String(days))} DAY
      AND stu.arrival_delay IS NOT NULL
  `)) as unknown as [
    {
      total_samples: number | string | null;
      on_time_count: number | string | null;
      avg_delay_sec: number | string | null;
      worst_delay_sec: number | string | null;
      major_delay_count: number | string | null;
    }[],
    unknown,
  ];

  const row = rows?.[0];
  const totalSamples = row ? Number(row.total_samples ?? 0) : 0;
  const onTimeCount = row ? Number(row.on_time_count ?? 0) : 0;
  const avgDelaySec = row?.avg_delay_sec != null ? Number(row.avg_delay_sec) : null;
  const worstDelaySec = row?.worst_delay_sec != null ? Number(row.worst_delay_sec) : null;
  const majorDelayCount = row ? Number(row.major_delay_count ?? 0) : 0;

  c.header("Cache-Control", "public, max-age=300");
  return c.json({
    stopId: id,
    days,
    totalSamples,
    onTimePct: totalSamples > 0 ? (100 * onTimeCount) / totalSamples : null,
    avgDelaySec,
    worstDelaySec,
    majorDelayCount,
  });
});
