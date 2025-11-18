import { Context } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, and, gte, sql } from "drizzle-orm";
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
import { getClosestSnapshot } from "./utils";

export async function departuresHandler(c: Context) {
  const db = drizzle(c.env.DATABASE);
  const providerId = c.req.param("provider");
  const stationCode = c.req.param("station")?.toUpperCase();
  const platform = c.req.param("platform");

  if (!stationCode) {
    return c.json({ error: "Station code required" }, 400);
  }

  // Find the stop_id based on station and platform
  // e.g., station "LAKE" + platform "1" = stop_id "A10-1"
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

  const atParam = c.req.query("at");
  let targetTime: Date | undefined;
  if (atParam) {
    targetTime = new Date(atParam);
    if (isNaN(targetTime.getTime())) {
      return c.json({ error: "Invalid date format for 'at' parameter" }, 400);
    }
  }

  // Find closest snapshot
  const snapshot = await getClosestSnapshot(db, providerId, targetTime);
  if (!snapshot) {
    return c.json(
      {
        error: "No snapshot found within 1 minute of target time",
        provider: providerId,
        targetTime: targetTime?.toISOString(),
      },
      404
    );
  }

  // Get all trip updates for this snapshot
  const tripUpdateEntities = await db
    .select()
    .from(entities)
    .where(eq(entities.snapshotId, snapshot.id))
    .innerJoin(tripUpdates, eq(entities.tripUpdateId, tripUpdates.id));

  // Filter for trips that stop at this station
  const departures = [];

  for (const row of tripUpdateEntities) {
    const tripUpdate = row.trip_updates;
    const entity = row.entities;

    // Get trip descriptor
    const tripDescriptor = await db
      .select()
      .from(tripDescriptors)
      .where(
        and(
          eq(tripDescriptors.providerId, providerId),
          eq(tripDescriptors.tripId, tripUpdate.entityId)
        )
      )
      .limit(1)
      .then((rows) => rows[0]);

    if (!tripDescriptor) continue;

    // Get static trip data
    const staticTrip = await db
      .select()
      .from(trips)
      .where(
        and(
          eq(trips.providerId, providerId),
          eq(trips.tripId, tripDescriptor.tripId)
        )
      )
      .limit(1)
      .then((rows) => rows[0]);

    // Get route data
    const route = tripDescriptor.routeId
      ? await db
          .select()
          .from(routes)
          .where(
            and(
              eq(routes.providerId, providerId),
              eq(routes.routeId, tripDescriptor.routeId)
            )
          )
          .limit(1)
          .then((rows) => rows[0])
      : null;

    // Get vehicle descriptor
    const vehicleDescriptor = await db
      .select()
      .from(vehicleDescriptors)
      .where(
        and(
          eq(vehicleDescriptors.providerId, providerId),
          eq(vehicleDescriptors.vehicleId, tripUpdate.entityId)
        )
      )
      .limit(1)
      .then((rows) => rows[0]);

    // Get stop time updates for this trip
    const stopTimeUpdateRecords = await db
      .select()
      .from(stopTimeUpdates)
      .where(eq(stopTimeUpdates.tripUpdateId, tripUpdate.id));

    // Find the stop time update for our station
    for (const stu of stopTimeUpdateRecords) {
      // Get scheduled stop time
      const scheduledStopTime = await db
        .select()
        .from(stopTimes)
        .where(
          and(
            eq(stopTimes.providerId, providerId),
            eq(stopTimes.tripId, tripDescriptor.tripId),
            eq(stopTimes.stopSequence, stu.stopSequence || 0)
          )
        )
        .limit(1)
        .then((rows) => rows[0]);

      if (!scheduledStopTime) continue;

      // Check if this stop matches our station
      const matchesStation = stationStops.some(
        (s) => s.stopId === scheduledStopTime.stopId
      );

      if (!matchesStation) continue;

      // Get the stop details
      const stop = await db
        .select()
        .from(stops)
        .where(
          and(
            eq(stops.providerId, providerId),
            eq(stops.stopId, scheduledStopTime.stopId)
          )
        )
        .limit(1)
        .then((rows) => rows[0]);

      // Get departure time event
      const events = await db
        .select()
        .from(stopTimeEvents)
        .where(eq(stopTimeEvents.stopTimeUpdateId, stu.id));

      const departure = events.find((e) => e.type === 1); // departure
      const arrival = events.find((e) => e.type === 0); // arrival

      // Calculate minutes until departure
      let minutesUntilDeparture = null;
      let departureTime = null;

      if (departure?.time) {
        departureTime = new Date(departure.time);
        minutesUntilDeparture = Math.round(
          (departureTime.getTime() - snapshot.feedTimestamp.getTime()) / 1000 / 60
        );
      } else if (scheduledStopTime.departureTime && departure?.delay) {
        // Calculate from scheduled time + delay
        const [hours, minutes, seconds] = scheduledStopTime.departureTime.split(':').map(Number);
        const scheduled = new Date(snapshot.feedTimestamp);
        scheduled.setHours(hours, minutes, seconds, 0);
        departureTime = new Date(scheduled.getTime() + (departure.delay * 1000));
        minutesUntilDeparture = Math.round(
          (departureTime.getTime() - snapshot.feedTimestamp.getTime()) / 1000 / 60
        );
      }

      departures.push({
        destination: staticTrip?.tripHeadsign || "Unknown",
        route: {
          route_id: route?.routeId,
          route_name: route?.routeShortName,
          color: route?.routeColor,
          text_color: route?.routeTextColor,
        },
        platform: stop?.platformCode,
        minutes: minutesUntilDeparture,
        scheduled_departure: scheduledStopTime.departureTime,
        delay: departure?.delay || 0,
        train_length: null, // BART doesn't provide this in GTFS-RT
        bikes_allowed: true, // BART allows bikes on all trains
        vehicle_label: vehicleDescriptor?.label,
        stop_sequence: stu.stopSequence,
      });
    }
  }

  // Sort by minutes until departure
  departures.sort((a, b) => {
    if (a.minutes === null) return 1;
    if (b.minutes === null) return -1;
    return a.minutes - b.minutes;
  });

  return c.json({
    station: stationCode,
    platform: platform || "all",
    station_name: stationStops[0]?.stopName,
    timestamp: snapshot.feedTimestamp,
    departures: departures,
  });
}
