import { Context } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, and } from "drizzle-orm";
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

export async function tripUpdatesHandler(c: Context) {
  const db = drizzle(c.env.DATABASE);
  const providerId = c.req.param("provider");
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
    // Get latest finished snapshot
    snapshot = await getLatestFinishedSnapshot(db, providerId);
    if (!snapshot) {
      return c.json(
        {
          error: "No finished snapshot found",
          provider: providerId,
        },
        404,
      );
    }
  }

  // Get all trip update entities with their main relationships using JOINs
  const tripUpdateData = await db
    .select({
      entity: entities,
      tripUpdate: tripUpdates,
      tripDescriptor: tripDescriptors,
      staticTrip: trips,
      route: routes,
      vehicleDescriptor: vehicleDescriptors,
    })
    .from(entities)
    .innerJoin(tripUpdates, eq(entities.tripUpdateId, tripUpdates.id))
    .leftJoin(
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
    .where(eq(entities.snapshotId, snapshot.id));

  if (tripUpdateData.length === 0) {
    return c.json({
      snapshot: {
        id: snapshot.id,
        timestamp: snapshot.feedTimestamp,
        version: snapshot.gtfsRealtimeVersion,
        entity_count: snapshot.entitiesCount,
      },
      provider: providerId,
      trip_updates: [],
    });
  }

  // Get stop time updates with all related data using JOINs
  // Join through entities to ensure we only get data for this snapshot
  const stopTimeData = await db
    .select({
      tripUpdateId: tripUpdates.id,
      tripId: tripDescriptors.tripId,
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
    .innerJoin(
      stopTimeUpdates,
      eq(stopTimeUpdates.tripUpdateId, tripUpdates.id)
    )
    .leftJoin(
      stopTimes,
      and(
        eq(stopTimes.providerId, providerId),
        eq(stopTimes.tripId, tripDescriptors.tripId),
        eq(stopTimes.stopSequence, stopTimeUpdates.stopSequence)
      )
    )
    .leftJoin(
      stops,
      and(
        eq(stops.providerId, providerId),
        eq(stops.stopId, stopTimes.stopId)
      )
    )
    .where(eq(entities.snapshotId, snapshot.id));

  // Get stop time events using JOIN through the snapshot
  const eventsData = await db
    .select({
      stopTimeUpdateId: stopTimeUpdates.id,
      event: stopTimeEvents,
    })
    .from(entities)
    .innerJoin(tripUpdates, eq(entities.tripUpdateId, tripUpdates.id))
    .innerJoin(
      stopTimeUpdates,
      eq(stopTimeUpdates.tripUpdateId, tripUpdates.id)
    )
    .innerJoin(
      stopTimeEvents,
      eq(stopTimeEvents.stopTimeUpdateId, stopTimeUpdates.id)
    )
    .where(eq(entities.snapshotId, snapshot.id));

  // Create lookup maps
  const stopTimeEventsMap = new Map<number, typeof stopTimeEvents[]>();
  for (const row of eventsData) {
    const key = row.stopTimeUpdateId;
    if (!stopTimeEventsMap.has(key)) {
      stopTimeEventsMap.set(key, []);
    }
    stopTimeEventsMap.get(key)!.push(row.event);
  }

  const stopTimesByTripUpdateMap = new Map<number, typeof stopTimeData>();
  for (const st of stopTimeData) {
    const key = st.tripUpdateId;
    if (!stopTimesByTripUpdateMap.has(key)) {
      stopTimesByTripUpdateMap.set(key, []);
    }
    stopTimesByTripUpdateMap.get(key)!.push(st);
  }

  // Build results
  const results = tripUpdateData.map((row) => {
    const stopTimeRecords =
      stopTimesByTripUpdateMap.get(row.tripUpdate.id) || [];

    const stopTimesWithEvents = stopTimeRecords.map((st) => {
      const events = stopTimeEventsMap.get(st.stopTimeUpdate.id) || [];
      const arrival = events.find((e) => e.type === 0);
      const departure = events.find((e) => e.type === 1);

      return {
        stop_sequence: st.stopTimeUpdate.stopSequence,
        stop_id: st.scheduledStopTime?.stopId,
        stop_name: st.stop?.stopName,
        platform: st.stop?.platformCode,
        scheduled_arrival: st.scheduledStopTime?.arrivalTime,
        scheduled_departure: st.scheduledStopTime?.departureTime,
        schedule_relationship: st.stopTimeUpdate.scheduleRelationship,
        arrival: arrival
          ? {
              delay: arrival.delay,
              time: arrival.time,
              uncertainty: arrival.uncertainty,
            }
          : null,
        departure: departure
          ? {
              delay: departure.delay,
              time: departure.time,
              uncertainty: departure.uncertainty,
            }
          : null,
      };
    });

    return {
      entity_id: row.entity.entityId,
      is_deleted: row.entity.isDeleted === 1,
      trip: row.tripDescriptor
        ? {
            trip_id: row.tripDescriptor.tripId,
            route_id: row.tripDescriptor.routeId,
            headsign: row.staticTrip?.tripHeadsign,
            direction_id: row.tripDescriptor.directionId,
            start_date: row.tripDescriptor.startDate,
            start_time: row.tripDescriptor.startTime,
            schedule_relationship: row.tripDescriptor.scheduleRelationship,
          }
        : null,
      route: row.route
        ? {
            route_id: row.route.routeId,
            route_name: row.route.routeShortName,
            route_long_name: row.route.routeLongName,
            color: row.route.routeColor,
            text_color: row.route.routeTextColor,
          }
        : null,
      vehicle: row.vehicleDescriptor
        ? {
            id: row.vehicleDescriptor.vehicleId,
            label: row.vehicleDescriptor.label,
            license_plate: row.vehicleDescriptor.licensePlate,
          }
        : null,
      timestamp: row.tripUpdate.timestamp,
      delay: row.tripUpdate.delay,
      stop_time_updates: stopTimesWithEvents,
    };
  });

  return c.json({
    snapshot: {
      id: snapshot.id,
      timestamp: snapshot.feedTimestamp,
      version: snapshot.gtfsRealtimeVersion,
      entity_count: snapshot.entitiesCount,
    },
    provider: providerId,
    trip_updates: results,
  });
}
