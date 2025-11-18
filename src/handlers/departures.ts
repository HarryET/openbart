import { Context } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, and, sql } from "drizzle-orm";
import {
  entities,
  tripUpdates,
  stopTimeUpdates,
  stopTimeEvents,
  tripDescriptors,
  vehicleDescriptors,
  routes,
  stops,
  trips,
  stopTimes,
} from "../schema";
import { getLatestFinishedSnapshot, getSnapshotById } from "./utils";

export async function departuresHandler(c: Context) {
  const db = drizzle(c.env.DATABASE);
  const providerId = c.req.param("provider");
  const stationCode = c.req.param("station")?.toUpperCase();
  const platform = c.req.param("platform");

  if (!stationCode) {
    return c.json({ error: "Station code required" }, 400);
  }

  // Find the stop_id based on station and platform
  const stopQuery = platform
    ? and(
        eq(stops.providerId, providerId),
        eq(stops.zoneId, stationCode),
        eq(stops.platformCode, platform)
      )
    : and(
        eq(stops.providerId, providerId),
        eq(stops.zoneId, stationCode)
      );

  const stationStops = await db
    .select()
    .from(stops)
    .where(stopQuery);

  if (stationStops.length === 0) {
    return c.json(
      { error: `Station ${stationCode}${platform ? ` platform ${platform}` : ""} not found` },
      404
    );
  }

  const snapshotParam = c.req.query("snapshot");

  let snapshot;
  if (snapshotParam) {
    const snapshotId = parseInt(snapshotParam);
    if (isNaN(snapshotId)) {
      return c.json({ error: "Invalid snapshot ID" }, 400);
    }
    snapshot = await getSnapshotById(db, snapshotId);
    if (!snapshot) {
      return c.json({ error: "Snapshot not found" }, 404);
    }
    if (snapshot.providerId !== providerId) {
      return c.json({ error: "Snapshot does not belong to this provider" }, 400);
    }
  } else {
    snapshot = await getLatestFinishedSnapshot(db, providerId);
    if (!snapshot) {
      return c.json(
        {
          error: "No finished snapshot found",
          provider: providerId,
        },
        404
      );
    }
  }

  const stationStopIds = stationStops.map((s) => s.stopId);

  // Single query with JOINs to get all relevant departures
  const departureResults = await db
    .select({
      tripUpdate: tripUpdates,
      entity: entities,
      tripDescriptor: tripDescriptors,
      staticTrip: trips,
      route: routes,
      vehicleDescriptor: vehicleDescriptors,
      stopTimeUpdate: stopTimeUpdates,
      scheduledStopTime: stopTimes,
      stop: stops,
    })
    .from(entities)
    .innerJoin(tripUpdates, eq(entities.tripUpdateId, tripUpdates.id))
    .innerJoin(
      tripDescriptors,
      and(
        eq(tripDescriptors.providerId, providerId),
        eq(tripDescriptors.tripId, tripUpdates.entityId)
      )
    )
    .leftJoin(
      trips,
      and(
        eq(trips.providerId, providerId),
        eq(trips.tripId, tripDescriptors.tripId)
      )
    )
    .leftJoin(
      routes,
      and(
        eq(routes.providerId, providerId),
        eq(routes.routeId, tripDescriptors.routeId)
      )
    )
    .leftJoin(
      vehicleDescriptors,
      and(
        eq(vehicleDescriptors.providerId, providerId),
        eq(vehicleDescriptors.vehicleId, tripUpdates.entityId)
      )
    )
    .innerJoin(
      stopTimeUpdates,
      eq(stopTimeUpdates.tripUpdateId, tripUpdates.id)
    )
    .innerJoin(
      stopTimes,
      and(
        eq(stopTimes.providerId, providerId),
        eq(stopTimes.tripId, tripDescriptors.tripId),
        eq(stopTimes.stopSequence, stopTimeUpdates.stopSequence)
      )
    )
    .innerJoin(
      stops,
      and(
        eq(stops.providerId, providerId),
        eq(stops.stopId, stopTimes.stopId)
      )
    )
    .where(
      and(
        eq(entities.snapshotId, snapshot.id),
        sql`${stopTimes.stopId} IN ${stationStopIds}`
      )
    );

  // Get all stop time events for the results
  const stopTimeUpdateIds = departureResults.map((row) => row.stopTimeUpdate.id);
  const eventsResults =
    stopTimeUpdateIds.length > 0
      ? await db
          .select()
          .from(stopTimeEvents)
          .where(sql`${stopTimeEvents.stopTimeUpdateId} IN ${stopTimeUpdateIds}`)
      : [];

  // Create events map
  const stopTimeEventsMap = new Map<number, typeof eventsResults>();
  for (const event of eventsResults) {
    const key = event.stopTimeUpdateId;
    if (!stopTimeEventsMap.has(key)) {
      stopTimeEventsMap.set(key, []);
    }
    stopTimeEventsMap.get(key)!.push(event);
  }

  // Build departures
  const departures = departureResults.map((row) => {
    const events = stopTimeEventsMap.get(row.stopTimeUpdate.id) || [];
    const departure = events.find((e) => e.type === 1);
    const arrival = events.find((e) => e.type === 0);

    let minutesUntilDeparture = null;
    let departureTime = null;

    if (departure?.time) {
      departureTime = new Date(departure.time);
      minutesUntilDeparture = Math.round(
        (departureTime.getTime() - snapshot.feedTimestamp.getTime()) / 1000 / 60
      );
    } else if (row.scheduledStopTime.departureTime && departure?.delay) {
      const [hours, minutes, seconds] = row.scheduledStopTime.departureTime
        .split(":")
        .map(Number);
      const scheduled = new Date(snapshot.feedTimestamp);
      scheduled.setHours(hours, minutes, seconds, 0);
      departureTime = new Date(scheduled.getTime() + departure.delay * 1000);
      minutesUntilDeparture = Math.round(
        (departureTime.getTime() - snapshot.feedTimestamp.getTime()) / 1000 / 60
      );
    }

    return {
      destination: row.staticTrip?.tripHeadsign || "Unknown",
      route: {
        route_id: row.route?.routeId,
        route_name: row.route?.routeShortName,
        color: row.route?.routeColor,
        text_color: row.route?.routeTextColor,
      },
      platform: row.stop?.platformCode,
      minutes: minutesUntilDeparture,
      scheduled_departure: row.scheduledStopTime.departureTime,
      delay: departure?.delay || 0,
      train_length: null,
      bikes_allowed: true,
      vehicle_label: row.vehicleDescriptor?.label,
      stop_sequence: row.stopTimeUpdate.stopSequence,
    };
  });

  // Sort by minutes until departure
  departures.sort((a, b) => {
    if (a.minutes === null) return 1;
    if (b.minutes === null) return -1;
    return a.minutes - b.minutes;
  });

  const platformCodes = stationStops
    .map((stop) => stop.platformCode)
    .filter((code): code is string => Boolean(code));

  const uniquePlatforms = Array.from(new Set(platformCodes)).sort((a, b) => {
    const numA = Number(a);
    const numB = Number(b);
    if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
      return numA - numB;
    }
    return a.localeCompare(b);
  });

  return c.json({
    station: stationCode,
    platform: platform || "all",
    station_name: stationStops[0]?.stopName,
    timestamp: snapshot.feedTimestamp,
    platforms: uniquePlatforms,
    departures: departures,
  });
}
