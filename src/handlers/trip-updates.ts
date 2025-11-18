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
import { getClosestSnapshot } from "./utils";

export async function tripUpdatesHandler(c: Context) {
  const db = drizzle(c.env.DATABASE);
  const providerId = c.req.param("provider");
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
      404,
    );
  }

  // Get all trip update entities for this snapshot
  const tripUpdateEntities = await db
    .select()
    .from(entities)
    .where(eq(entities.snapshotId, snapshot.id))
    .innerJoin(tripUpdates, eq(entities.tripUpdateId, tripUpdates.id));

  // Fetch related data for each trip update with static GTFS data
  const results = await Promise.all(
    tripUpdateEntities.map(async (row) => {
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

      // Get static trip data (headsign, etc.)
      const staticTrip = tripDescriptor
        ? await db
            .select()
            .from(trips)
            .where(
              and(
                eq(trips.providerId, providerId),
                eq(trips.tripId, tripDescriptor.tripId)
              )
            )
            .limit(1)
            .then((rows) => rows[0])
        : null;

      // Get route data (line color, name)
      const route = tripDescriptor?.routeId
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

      // Get stop time updates with enriched stop data
      const stopTimeUpdateRecords = await db
        .select()
        .from(stopTimeUpdates)
        .where(eq(stopTimeUpdates.tripUpdateId, tripUpdate.id));

      // Get arrival/departure for each stop time with stop names
      const stopTimesWithEvents = await Promise.all(
        stopTimeUpdateRecords.map(async (st) => {
          const events = await db
            .select()
            .from(stopTimeEvents)
            .where(eq(stopTimeEvents.stopTimeUpdateId, st.id));

          const arrival = events.find((e) => e.type === 0);
          const departure = events.find((e) => e.type === 1);

          // Get scheduled stop time from static GTFS
          const scheduledStopTime = tripDescriptor
            ? await db
                .select()
                .from(stopTimes)
                .where(
                  and(
                    eq(stopTimes.providerId, providerId),
                    eq(stopTimes.tripId, tripDescriptor.tripId),
                    eq(stopTimes.stopSequence, st.stopSequence || 0)
                  )
                )
                .limit(1)
                .then((rows) => rows[0])
            : null;

          // Get stop details (name, location)
          const stop = scheduledStopTime
            ? await db
                .select()
                .from(stops)
                .where(
                  and(
                    eq(stops.providerId, providerId),
                    eq(stops.stopId, scheduledStopTime.stopId)
                  )
                )
                .limit(1)
                .then((rows) => rows[0])
            : null;

          return {
            stop_sequence: st.stopSequence,
            stop_id: scheduledStopTime?.stopId,
            stop_name: stop?.stopName,
            platform: stop?.platformCode,
            scheduled_arrival: scheduledStopTime?.arrivalTime,
            scheduled_departure: scheduledStopTime?.departureTime,
            schedule_relationship: st.scheduleRelationship,
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
        }),
      );

      return {
        entity_id: entity.entityId,
        is_deleted: entity.isDeleted === 1,
        trip: tripDescriptor
          ? {
              trip_id: tripDescriptor.tripId,
              route_id: tripDescriptor.routeId,
              headsign: staticTrip?.tripHeadsign,
              direction_id: tripDescriptor.directionId,
              start_date: tripDescriptor.startDate,
              start_time: tripDescriptor.startTime,
              schedule_relationship: tripDescriptor.scheduleRelationship,
            }
          : null,
        route: route
          ? {
              route_id: route.routeId,
              route_name: route.routeShortName,
              route_long_name: route.routeLongName,
              color: route.routeColor,
              text_color: route.routeTextColor,
            }
          : null,
        vehicle: vehicleDescriptor
          ? {
              id: vehicleDescriptor.vehicleId,
              label: vehicleDescriptor.label,
              license_plate: vehicleDescriptor.licensePlate,
            }
          : null,
        timestamp: tripUpdate.timestamp,
        delay: tripUpdate.delay,
        stop_time_updates: stopTimesWithEvents,
      };
    }),
  );

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
