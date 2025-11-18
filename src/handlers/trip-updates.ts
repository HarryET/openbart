import { Context } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import {
  entities,
  tripUpdates,
  stopTimeUpdates,
  stopTimeEvents,
  tripDescriptors,
  vehicleDescriptors,
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

  // Fetch related data for each trip update
  const results = await Promise.all(
    tripUpdateEntities.map(async (row) => {
      const tripUpdate = row.trip_updates;
      const entity = row.entities;

      // Get trip descriptor
      const tripDescriptor = await db
        .select()
        .from(tripDescriptors)
        .where(
          eq(tripDescriptors.providerId, providerId),
        )
        .limit(1)
        .then((rows) => rows[0]);

      // Get vehicle descriptor
      const vehicleDescriptor = await db
        .select()
        .from(vehicleDescriptors)
        .where(
          eq(vehicleDescriptors.providerId, providerId),
        )
        .limit(1)
        .then((rows) => rows[0]);

      // Get stop time updates
      const stopTimes = await db
        .select()
        .from(stopTimeUpdates)
        .where(eq(stopTimeUpdates.tripUpdateId, tripUpdate.id));

      // Get arrival/departure for each stop time
      const stopTimesWithEvents = await Promise.all(
        stopTimes.map(async (st) => {
          const events = await db
            .select()
            .from(stopTimeEvents)
            .where(eq(stopTimeEvents.stopTimeUpdateId, st.id));

          const arrival = events.find((e) => e.type === 0);
          const departure = events.find((e) => e.type === 1);

          return {
            stop_sequence: st.stopSequence,
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
              direction_id: tripDescriptor.directionId,
              start_date: tripDescriptor.startDate,
              start_time: tripDescriptor.startTime,
              schedule_relationship: tripDescriptor.scheduleRelationship,
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
