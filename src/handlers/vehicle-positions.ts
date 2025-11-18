import { Context } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, and } from "drizzle-orm";
import {
  entities,
  vehiclePositions,
  tripDescriptors,
  vehicleDescriptors,
  positions,
} from "../schema";
import { getLatestFinishedSnapshot, getSnapshotById } from "./utils";

export async function vehiclePositionsHandler(c: Context) {
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

  // Single query with JOINs to get all vehicle positions with related data
  const results = await db
    .select({
      entity: entities,
      vehiclePosition: vehiclePositions,
      tripDescriptor: tripDescriptors,
      vehicleDescriptor: vehicleDescriptors,
      position: positions,
    })
    .from(entities)
    .innerJoin(
      vehiclePositions,
      eq(entities.vehiclePositionId, vehiclePositions.id)
    )
    .leftJoin(
      tripDescriptors,
      and(
        eq(tripDescriptors.providerId, providerId),
        eq(tripDescriptors.tripId, vehiclePositions.entityId)
      )
    )
    .leftJoin(
      vehicleDescriptors,
      and(
        eq(vehicleDescriptors.providerId, providerId),
        eq(vehicleDescriptors.vehicleId, vehiclePositions.entityId)
      )
    )
    .leftJoin(
      positions,
      and(
        eq(positions.providerId, providerId),
        eq(positions.entityId, vehiclePositions.entityId)
      )
    )
    .where(eq(entities.snapshotId, snapshot.id));

  // Transform results
  const vehiclePositionsData = results.map((row) => ({
    entity_id: row.entity.entityId,
    is_deleted: row.entity.isDeleted === 1,
    trip: row.tripDescriptor
      ? {
          trip_id: row.tripDescriptor.tripId,
          route_id: row.tripDescriptor.routeId,
          direction_id: row.tripDescriptor.directionId,
          start_date: row.tripDescriptor.startDate,
          start_time: row.tripDescriptor.startTime,
          schedule_relationship: row.tripDescriptor.scheduleRelationship,
        }
      : null,
    vehicle: row.vehicleDescriptor
      ? {
          id: row.vehicleDescriptor.vehicleId,
          label: row.vehicleDescriptor.label,
          license_plate: row.vehicleDescriptor.licensePlate,
        }
      : null,
    position: row.position
      ? {
          latitude: row.position.latitude,
          longitude: row.position.longitude,
          bearing: row.position.bearing,
          odometer: row.position.odometer,
          speed: row.position.speed,
        }
      : null,
    current_stop_sequence: row.vehiclePosition.currentStopSequence,
    stop_id: row.vehiclePosition.stopId,
    current_status: row.vehiclePosition.currentStatus,
    timestamp: row.vehiclePosition.timestamp,
    congestion_level: row.vehiclePosition.congestionLevel,
    occupancy_status: row.vehiclePosition.occupancyStatus,
    occupancy_percentage: row.vehiclePosition.occupancyPercentage,
  }));

  return c.json({
    snapshot: {
      id: snapshot.id,
      timestamp: snapshot.feedTimestamp,
      version: snapshot.gtfsRealtimeVersion,
      entity_count: snapshot.entitiesCount,
    },
    provider: providerId,
    vehicle_positions: vehiclePositionsData,
  });
}
