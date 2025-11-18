import { Context } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import {
  entities,
  vehiclePositions,
  tripDescriptors,
  vehicleDescriptors,
  positions,
} from "../schema";
import { getClosestSnapshot } from "./utils";

export async function vehiclePositionsHandler(c: Context) {
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

  const vehiclePositionEntities = await db
    .select()
    .from(entities)
    .where(eq(entities.snapshotId, snapshot.id))
    .innerJoin(
      vehiclePositions,
      eq(entities.vehiclePositionId, vehiclePositions.id),
    );

  const results = await Promise.all(
    vehiclePositionEntities.map(async (row) => {
      const vehiclePosition = row.vehicle_positions;
      const entity = row.entities;

      const tripDescriptor = await db
        .select()
        .from(tripDescriptors)
        .where(eq(tripDescriptors.providerId, providerId))
        .limit(1)
        .then((rows) => rows[0]);

      const vehicleDescriptor = await db
        .select()
        .from(vehicleDescriptors)
        .where(eq(vehicleDescriptors.providerId, providerId))
        .limit(1)
        .then((rows) => rows[0]);

      const position = await db
        .select()
        .from(positions)
        .where(eq(positions.providerId, providerId))
        .limit(1)
        .then((rows) => rows[0]);

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
        position: position
          ? {
              latitude: position.latitude,
              longitude: position.longitude,
              bearing: position.bearing,
              odometer: position.odometer,
              speed: position.speed,
            }
          : null,
        current_stop_sequence: vehiclePosition.currentStopSequence,
        stop_id: vehiclePosition.stopId,
        current_status: vehiclePosition.currentStatus,
        timestamp: vehiclePosition.timestamp,
        congestion_level: vehiclePosition.congestionLevel,
        occupancy_status: vehiclePosition.occupancyStatus,
        occupancy_percentage: vehiclePosition.occupancyPercentage,
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
    vehicle_positions: results,
  });
}
